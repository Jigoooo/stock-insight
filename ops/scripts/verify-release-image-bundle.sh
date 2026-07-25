#!/usr/bin/env bash
set -euo pipefail

[[ $# -ge 1 && $# -le 2 ]] || { echo "usage: $0 IMAGE_BUNDLE_DIR [ENV_FILE]" >&2; exit 64; }
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
BUNDLE_DIR=$(realpath "$1")
ENV_FILE=${2:-$ROOT/.env.docker}
DIND_IMAGE='docker@sha256:173f284a4299164772a90f52b373e73e087583c0963f1334c9995f190ef6f3f5'
DIND_NAME="stock-insight-bundle-proof-$$"
RESOLVED=$(mktemp)
cleanup() {
  rc=$?
  docker rm -f "$DIND_NAME" >/dev/null 2>&1 || true
  rm -f "$RESOLVED"
  return "$rc"
}
trap cleanup EXIT
[[ -s "$ENV_FILE" ]] || { echo "missing env file: $ENV_FILE" >&2; exit 66; }
for required in IMAGE_METADATA SHA256SUMS; do [[ -s "$BUNDLE_DIR/$required" ]] || { echo "missing $required" >&2; exit 66; }; done

docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" \
  -f "$ROOT/docker-compose.prod.yml" config --format json >"$RESOLVED"
python3 - "$BUNDLE_DIR" "$RESOLVED" <<'PY'
import hashlib, json, pathlib, re, sys, tarfile
root=pathlib.Path(sys.argv[1]); resolved=json.loads(pathlib.Path(sys.argv[2]).read_text())
keys=('FORMAT_VERSION','BUNDLE','BUNDLE_SHA256','API_TAG','API_IMAGE_ID','APP_TAG','APP_IMAGE_ID','LOAD_COMMAND')
values={}
for raw in (root/'IMAGE_METADATA').read_text().splitlines():
    if not raw: continue
    if '=' not in raw: raise SystemExit('invalid metadata row')
    key,value=raw.split('=',1)
    if key in values or key not in keys: raise SystemExit(f'duplicate/unknown metadata key: {key}')
    values[key]=value
if set(values)!=set(keys) or values['FORMAT_VERSION']!='1': raise SystemExit('invalid metadata schema')
if not re.fullmatch(r'[A-Za-z0-9_.-]+\.tar',values['BUNDLE']): raise SystemExit('invalid bundle filename')
if values['LOAD_COMMAND'] != f"docker load --input {values['BUNDLE']}": raise SystemExit('invalid load command')
bundle=root/values['BUNDLE']
if not bundle.is_file(): raise SystemExit('missing bundle')
sha=lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
if sha(bundle)!=values['BUNDLE_SHA256']: raise SystemExit('bundle metadata hash mismatch')
rows=(root/'SHA256SUMS').read_text().splitlines()
expected_names=(values['BUNDLE'],'IMAGE_METADATA')
parsed={}
for row in rows:
    m=re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)',row)
    if not m or m.group(2) in parsed: raise SystemExit('invalid checksum manifest')
    parsed[m.group(2)]=m.group(1)
if set(parsed)!=set(expected_names): raise SystemExit('checksum manifest must contain only bundle and metadata')
for name,digest in parsed.items():
    if sha(root/name)!=digest: raise SystemExit(f'checksum mismatch: {name}')
services=resolved.get('services',{})
if set(services)!= {'api','app'}: raise SystemExit('unexpected resolved services')
compose_ids={key:services[key].get('image') for key in ('api','app')}
if values['API_IMAGE_ID']!=compose_ids['api'] or values['APP_IMAGE_ID']!=compose_ids['app']:
    raise SystemExit('bundle IDs are not bound to resolved production Compose')
for key in ('api','app'):
    if services[key].get('pull_policy')!='never' or 'build' in services[key]: raise SystemExit(f'unsafe service: {key}')
with tarfile.open(bundle) as archive:
    members=archive.getmembers(); names=[m.name for m in members]
    if len(names)!=len(set(names)): raise SystemExit('duplicate tar member')
    for member in members:
        if member.issym() or member.islnk() or not (member.isfile() or member.isdir()): raise SystemExit('unsafe tar member')
    def read_json(name):
        member=archive.getmember(name)
        if not member.isfile(): raise SystemExit(f'non-regular JSON member: {name}')
        return json.load(archive.extractfile(member))
    index=read_json('index.json')
    manifests=index.get('manifests',[])
    expected_digests={values['API_IMAGE_ID'],values['APP_IMAGE_ID']}
    actual_digests={x.get('digest') for x in manifests}
    if actual_digests!=expected_digests: raise SystemExit('OCI index digest mismatch')
    for descriptor in manifests:
        platform=descriptor.get('platform',{})
        if platform and (platform.get('os')!='linux' or platform.get('architecture')!='amd64'):
            raise SystemExit('unexpected descriptor platform')
        digest=descriptor['digest'].removeprefix('sha256:')
        manifest_path=f'blobs/sha256/{digest}'
        raw=archive.extractfile(archive.getmember(manifest_path)).read()
        if hashlib.sha256(raw).hexdigest()!=digest: raise SystemExit('manifest blob hash mismatch')
        manifest=json.loads(raw)
        refs=[manifest.get('config',{})]+manifest.get('layers',[])
        if not refs or not manifest.get('layers'): raise SystemExit('empty OCI manifest')
        for ref in refs:
            ref_digest=ref.get('digest','').removeprefix('sha256:')
            path=f'blobs/sha256/{ref_digest}'
            member=archive.getmember(path)
            if not member.isfile(): raise SystemExit('non-regular blob')
            payload=archive.extractfile(member).read()
            if hashlib.sha256(payload).hexdigest()!=ref_digest or len(payload)!=ref.get('size'):
                raise SystemExit('referenced blob integrity mismatch')
        config_digest=manifest['config']['digest'].removeprefix('sha256:')
        config=read_json(f'blobs/sha256/{config_digest}')
        if config.get('os')!='linux' or config.get('architecture')!='amd64': raise SystemExit('config platform mismatch')
        if len(config.get('rootfs',{}).get('diff_ids',[]))!=len(manifest['layers']): raise SystemExit('layer/config mismatch')
print(json.dumps({'bundle':values['BUNDLE'],'api':values['API_IMAGE_ID'],'app':values['APP_IMAGE_ID']}))
PY

BUNDLE=$(python3 -c "import pathlib; print(next(x.split('=',1)[1] for x in pathlib.Path('$BUNDLE_DIR/IMAGE_METADATA').read_text().splitlines() if x.startswith('BUNDLE=')))")
API_ID=$(python3 -c "import pathlib; print(next(x.split('=',1)[1] for x in pathlib.Path('$BUNDLE_DIR/IMAGE_METADATA').read_text().splitlines() if x.startswith('API_IMAGE_ID=')))")
APP_ID=$(python3 -c "import pathlib; print(next(x.split('=',1)[1] for x in pathlib.Path('$BUNDLE_DIR/IMAGE_METADATA').read_text().splitlines() if x.startswith('APP_IMAGE_ID=')))")
API_TAG=$(python3 -c "import pathlib; print(next(x.split('=',1)[1] for x in pathlib.Path('$BUNDLE_DIR/IMAGE_METADATA').read_text().splitlines() if x.startswith('API_TAG=')))")
APP_TAG=$(python3 -c "import pathlib; print(next(x.split('=',1)[1] for x in pathlib.Path('$BUNDLE_DIR/IMAGE_METADATA').read_text().splitlines() if x.startswith('APP_TAG=')))")
docker image inspect "$DIND_IMAGE" >/dev/null
docker run -d --privileged --network none --name "$DIND_NAME" \
  -v "$BUNDLE_DIR:/bundle:ro" "$DIND_IMAGE" --iptables=false >/dev/null
for _ in $(seq 1 120); do docker exec "$DIND_NAME" docker info >/dev/null 2>&1 && break; sleep 1; done
docker exec "$DIND_NAME" docker info >/dev/null
docker exec "$DIND_NAME" docker load --input "/bundle/$BUNDLE" >/dev/null
for pair in "$API_TAG=$API_ID" "$APP_TAG=$APP_ID"; do
  tag=${pair%%=*}; expected=${pair#*=}
  actual=$(docker exec "$DIND_NAME" docker image inspect "$tag" --format '{{.Id}}|{{.Os}}|{{.Architecture}}')
  [[ "$actual" == "$expected|linux|amd64" ]] || { echo "fresh daemon image mismatch: $tag $actual" >&2; exit 1; }
  docker exec "$DIND_NAME" docker create --name "probe-${tag%%:*}" --network none "$expected" >/dev/null
  docker exec "$DIND_NAME" docker rm "probe-${tag%%:*}" >/dev/null
done
printf 'image_bundle=PASS fresh_daemon=PASS api=%s app=%s\n' "$API_ID" "$APP_ID"
