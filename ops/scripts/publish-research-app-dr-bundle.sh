#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
BACKUP_ROOT=${RESEARCH_APP_LOGICAL_BACKUP_ROOT:-/home/jigoo/hermes-work/research-app-db/backups/logical}
IMAGE_DIR=${STOCK_INSIGHT_IMAGE_BUNDLE_DIR:-/home/jigoo/hermes-work/backups/stock-insight/images/p1p6-380fb1cb}
DR_ROOT=${STOCK_INSIGHT_DR_ROOT:-/mnt/c/Users/HP/OneDrive/StockInsight-DR}
RECIPIENT_FILE=${STOCK_INSIGHT_DR_AGE_RECIPIENT_FILE:-/home/jigoo/.hermes/secrets/stock-insight-dr-age.recipient}
AGE_BIN=${STOCK_INSIGHT_DR_AGE_BIN:-/home/jigoo/.local/bin/age}
[[ -s "$BACKUP_ROOT/LAST_SUCCESS" ]] || { echo 'missing LAST_SUCCESS' >&2; exit 66; }
BACKUP_DIR=$(realpath "$(cat "$BACKUP_ROOT/LAST_SUCCESS")")
[[ "$BACKUP_DIR" == "$BACKUP_ROOT"/logical-* && -d "$BACKUP_DIR" ]] || { echo 'unsafe backup path' >&2; exit 65; }
[[ -d "$IMAGE_DIR" && -s "$RECIPIENT_FILE" ]] || { echo 'missing image bundle or age recipient' >&2; exit 66; }
[[ -x "$AGE_BIN" ]] || { echo 'missing executable age binary' >&2; exit 69; }
RECIPIENT=$(tr -d '\r\n' <"$RECIPIENT_FILE")
[[ "$RECIPIENT" == age1* ]] || { echo 'invalid age recipient' >&2; exit 65; }
python3 "$ROOT/ops/scripts/research-app-backup-contract.py" verify "$BACKUP_DIR" >/dev/null
"$ROOT/ops/scripts/verify-release-image-bundle.sh" "$IMAGE_DIR" "${STOCK_INSIGHT_COMPOSE_ENV_FILE:-$ROOT/.env.docker}"
install -d -m 700 "$DR_ROOT"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SOURCE_TREE=$(git -C "$ROOT" rev-parse HEAD^{tree})
SOURCE_COMMIT=$(git -C "$ROOT" rev-parse HEAD)
TMP=$(mktemp -d)
PARTIAL="$DR_ROOT/.partial-stock-insight-dr-$STAMP-$$.tar.zst.age"
FINAL="$DR_ROOT/stock-insight-dr-$STAMP-$SOURCE_TREE.tar.zst.age"
cleanup(){ rc=$?; rm -rf "$TMP"; [[ $rc -eq 0 ]] || rm -f "$PARTIAL"; return "$rc"; }
trap cleanup EXIT

git -C "$ROOT" archive --format=tar --prefix=stock-insight-source/ HEAD >"$TMP/stock-insight-source-$SOURCE_TREE.tar"
cat >"$TMP/DR_MANIFEST" <<EOF
FORMAT_VERSION=1
CREATED_AT=$STAMP
SOURCE_COMMIT=$SOURCE_COMMIT
SOURCE_TREE=$SOURCE_TREE
LOGICAL_BACKUP=$(basename "$BACKUP_DIR")
IMAGE_BUNDLE=$(basename "$IMAGE_DIR")
ENCRYPTION=age-x25519
OFFSITE_TARGET=onedrive
EOF
(
  cd "$TMP"
  sha256sum DR_MANIFEST "stock-insight-source-$SOURCE_TREE.tar" >SOURCE_SHA256SUMS
)
tar -cf - \
  -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")" \
  -C "$(dirname "$IMAGE_DIR")" "$(basename "$IMAGE_DIR")" \
  -C "$TMP" DR_MANIFEST SOURCE_SHA256SUMS "stock-insight-source-$SOURCE_TREE.tar" \
  | zstd -T0 -8 \
  | "$AGE_BIN" -r "$RECIPIENT" -o "$PARTIAL"
python3 - "$PARTIAL" "$DR_ROOT" <<'PY'
import os,sys
p=sys.argv[1]
with open(p,'rb') as f: os.fsync(f.fileno())
fd=os.open(sys.argv[2],os.O_RDONLY|os.O_DIRECTORY)
os.fsync(fd); os.close(fd)
PY
[[ ! -e "$FINAL" ]] || { echo 'DR bundle collision' >&2; exit 73; }
mv "$PARTIAL" "$FINAL"
python3 - "$DR_ROOT" <<'PY'
import os,sys
fd=os.open(sys.argv[1],os.O_RDONLY|os.O_DIRECTORY)
os.fsync(fd); os.close(fd)
PY
sha256sum "$FINAL" >"$FINAL.sha256"
python3 - "$FINAL.sha256" "$DR_ROOT" <<'PY'
import os,sys
with open(sys.argv[1],'rb') as f: os.fsync(f.fileno())
fd=os.open(sys.argv[2],os.O_RDONLY|os.O_DIRECTORY)
os.fsync(fd); os.close(fd)
PY
printf 'dr_bundle=%s\nsource_tree=%s\n' "$FINAL" "$SOURCE_TREE"
