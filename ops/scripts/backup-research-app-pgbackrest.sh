#!/usr/bin/env bash
set -euo pipefail
CONTAINER=${RESEARCH_APP_CONTAINER:-research-app-postgres}
TYPE=${1:-auto}
[[ "$TYPE" =~ ^(auto|full|diff|incr)$ ]] || { echo 'usage: backup-research-app-pgbackrest.sh [auto|full|diff|incr]' >&2; exit 64; }
docker exec "$CONTAINER" pgbackrest --stanza=research-app check
if [[ "$TYPE" == auto ]]; then
  if ! docker exec "$CONTAINER" pgbackrest --stanza=research-app info --output=json \
      | python3 -c "import json,sys; x=json.load(sys.stdin); raise SystemExit(0 if x and x[0].get('backup') else 1)"; then
    TYPE=full
  elif [[ "$(date +%u)" == 7 ]]; then
    TYPE=full
  else
    TYPE=diff
  fi
fi
docker exec "$CONTAINER" pgbackrest --stanza=research-app --type="$TYPE" backup
docker exec "$CONTAINER" pgbackrest --stanza=research-app info --output=json \
  | python3 -c "import json,sys; x=json.load(sys.stdin); b=x[0]['backup'][-1]; assert b['error'] is False and b['type'] in ('full','diff','incr'); print('pgbackrest_backup=PASS type='+b['type']+' label='+b['label'])"
