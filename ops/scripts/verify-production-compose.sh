#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=${1:-$ROOT/.env.docker}
MANIFEST_FILE=${2:-$ROOT/ops/release/production-image-manifest.json}
[[ -s "$ENV_FILE" ]] || { echo "missing env file: $ENV_FILE" >&2; exit 66; }
[[ -s "$MANIFEST_FILE" ]] || { echo "missing image manifest: $MANIFEST_FILE" >&2; exit 66; }

resolved=$(mktemp)
build_resolved=$(mktemp)
cleanup() { rm -f "$resolved" "$build_resolved"; }
trap cleanup EXIT

docker compose \
  --project-directory "$ROOT" \
  --env-file "$ENV_FILE" \
  -f "$ROOT/docker-compose.prod.yml" \
  config --format json >"$resolved"
docker compose \
  --project-directory "$ROOT" \
  -f "$ROOT/docker-compose.release-build.yml" \
  config --format json >"$build_resolved"

node -e '
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const model = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const buildModel = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const manifest = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
if (manifest.formatVersion !== 1) throw new Error(`unsupported image manifest format: ${manifest.formatVersion}`);
if (model.name !== "stock-insight") throw new Error(`project name mismatch: ${model.name}`);
for (const name of ["api", "app"]) {
  const release = manifest[name];
  if (!release || !/^sha256:[a-f0-9]{64}$/.test(release.imageId)) {
    throw new Error(`${name} release image ID is invalid`);
  }
  if (!new RegExp(`^stock-insight-${name}:[a-f0-9]{7}$`).test(release.tag)) {
    throw new Error(`${name} release tag is invalid`);
  }
  const service = model.services?.[name];
  if (!service) throw new Error(`missing service: ${name}`);
  if (service.image !== release.imageId) throw new Error(`${name} image mismatch: ${service.image}`);
  if (service.pull_policy !== "never") throw new Error(`${name} pull_policy mismatch`);
  if (Object.hasOwn(service, "build")) throw new Error(`${name} unexpectedly has build config`);
  const buildService = buildModel.services?.[name];
  if (!buildService?.build) throw new Error(`${name} release build config is missing`);
  if (buildService.image !== release.tag) throw new Error(`${name} release tag mismatch`);
  const localId = execFileSync("docker", ["image", "inspect", release.tag, "--format", "{{.Id}}"], {
    encoding: "utf8",
  }).trim();
  if (localId !== release.imageId) throw new Error(`${name} local tag does not resolve to manifest ID`);
}
const names = Object.keys(model.services ?? {}).sort();
if (JSON.stringify(names) !== JSON.stringify(["api", "app"])) {
  throw new Error(`unexpected production services: ${names.join(",")}`);
}
const buildNames = Object.keys(buildModel.services ?? {}).sort();
if (JSON.stringify(buildNames) !== JSON.stringify(["api", "app"])) {
  throw new Error(`unexpected release build services: ${buildNames.join(",")}`);
}
console.log(`compose_contract=PASS project=${model.name} services=${names.join(",")}`);
' "$resolved" "$build_resolved" "$MANIFEST_FILE"
