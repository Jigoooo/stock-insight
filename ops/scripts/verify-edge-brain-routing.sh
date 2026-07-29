#!/usr/bin/env bash
# P3 edge routing proof.
#
# Builds the new edge image and runs it on a THROWAWAY network alongside stub
# upstreams, so the live stock-insight-edge container is never touched. Verifies
# that the brain hostname routes to the api upstream, that only /v1/ is exposed,
# and that the browser hostname still reaches the app upstream.
set -euo pipefail

NET=p3-edge-probe-$$
IMG=stock-insight-edge-probe:$$
here="$(cd "$(dirname "$0")/../.." && pwd)"

cleanup() {
  docker rm -f p3-edge p3-app p3-api >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker rmi -f "$IMG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build -q -t "$IMG" "$here/deploy/stock-edge" >/dev/null
docker network create "$NET" >/dev/null

# Stub upstreams that echo which one answered.
docker run -d --name p3-app --network "$NET" --network-alias stock-insight-app \
  -e PORT=3000 python:3.12-alpine \
  sh -c 'mkdir -p /s && cd /s && echo APP_UPSTREAM > index.html && python -m http.server 3000' >/dev/null
docker run -d --name p3-api --network "$NET" --network-alias stock-insight-api \
  python:3.12-alpine \
  sh -c 'mkdir -p /s/v1 && cd /s && echo API_ROOT > index.html && echo API_V1 > v1/index.html && python -m http.server 6200' >/dev/null
docker run -d --name p3-edge --network "$NET" "$IMG" >/dev/null

for _ in $(seq 1 30); do
  docker exec p3-edge wget -qO- http://127.0.0.1/__edge_health >/dev/null 2>&1 && break
  sleep 1
done

pass=0; fail=0
check() { # name host path expected_code expected_body_regex
  local name=$1 host=$2 path=$3 want_code=$4 want_body=${5:-}
  local out code body
  out=$(docker exec p3-edge wget -qS -O- --header="Host: $host" \
        --header="X-Forwarded-Proto: https" "http://127.0.0.1$path" 2>&1 || true)
  code=$(printf '%s' "$out" | grep -oE 'HTTP/1\.[01] [0-9]{3}' | tail -1 | awk '{print $2}')
  code=${code:-000}
  body=$(printf '%s' "$out" | tail -1)
  if [ "$code" = "$want_code" ] && { [ -z "$want_body" ] || printf '%s' "$out" | grep -q "$want_body"; }; then
    echo "PASS  $name  ($host$path -> $code)"; pass=$((pass+1))
  else
    echo "FAIL  $name  ($host$path -> $code, want $want_code${want_body:+ / $want_body})"; fail=$((fail+1))
  fi
}

echo "=== browser hostname keeps reaching the app ==="
check "stock.jigooo.com / -> app"          stock.jigooo.com        /            200 APP_UPSTREAM

echo
echo "=== brain hostname reaches the api, /v1/ only ==="
check "insight-api /v1/ -> api"            insight-api.jigooo.com  /v1/         200 API_V1
check "insight-api / -> 404 (not api)"     insight-api.jigooo.com  /            404
check "insight-api /health blocked"        insight-api.jigooo.com  /health      404
check "insight-api /v1/meta reachable"     insight-api.jigooo.com  /v1/meta     404

echo
echo "=== brain hostname must NOT serve the app ==="
out=$(docker exec p3-edge wget -qO- --header="Host: insight-api.jigooo.com" \
      --header="X-Forwarded-Proto: https" http://127.0.0.1/ 2>&1 || true)
if printf '%s' "$out" | grep -q APP_UPSTREAM; then
  echo "FAIL  brain hostname leaked the app upstream"; fail=$((fail+1))
else
  echo "PASS  brain hostname never reaches the app upstream"; pass=$((pass+1))
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
