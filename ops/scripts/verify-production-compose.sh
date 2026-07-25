#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
ENV_FILE=${1:-$ROOT/.env.docker}
[[ -s "$ENV_FILE" ]] || { echo "missing env file: $ENV_FILE" >&2; exit 66; }

resolved=$(mktemp)
cleanup() { rm -f "$resolved"; }
trap cleanup EXIT

docker compose \
  --project-directory "$ROOT" \
  --env-file "$ENV_FILE" \
  -f "$ROOT/docker-compose.prod.yml" \
  config --format json >"$resolved"

node -e '
const fs = require("node:fs");
const model = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const expected = {
  api: "sha256:f207a1c18c116d6e4c08c565da710ece5fa8444686953c072bfb1969da0fd6cd",
  app: "sha256:ba69de3a275b097055f939fb3263821aac3fed8e9837c822f183301403d5f4d8",
};
if (model.name !== "stock-insight") throw new Error(`project name mismatch: ${model.name}`);
for (const [name, image] of Object.entries(expected)) {
  const service = model.services?.[name];
  if (!service) throw new Error(`missing service: ${name}`);
  if (service.image !== image) throw new Error(`${name} image mismatch: ${service.image}`);
  if (service.pull_policy !== "never") throw new Error(`${name} pull_policy mismatch`);
  if (Object.hasOwn(service, "build")) throw new Error(`${name} unexpectedly has build config`);
}
const names = Object.keys(model.services ?? {}).sort();
if (JSON.stringify(names) !== JSON.stringify(["api", "app"])) {
  throw new Error(`unexpected production services: ${names.join(",")}`);
}
console.log(`compose_contract=PASS project=${model.name} services=${names.join(",")}`);
' "$resolved"
