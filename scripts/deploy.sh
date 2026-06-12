#!/usr/bin/env bash
#
# Deploy the Nuxt app to a remote host over SSH. Host-agnostic: every
# deploy-target specific value comes from the environment so this script
# works for prod, staging, or any self-hosted instance.
#
# Required env:
#   DEPLOY_HOST     SSH alias or hostname (e.g. "plans-host" or "10.0.0.5")
#
# Optional env:
#   DEPLOY_USER     SSH user on the target (default: "openape")
#   DEPLOY_BASE     Base directory on target (default: "/home/${DEPLOY_USER}/projects/openape-testrun")
#   DEPLOY_PORT     Port the app should listen on (default: 3006)
#   DEPLOY_SERVICE  systemd unit name (default: "openape-testrun.service")
#   DEPLOY_HEALTH   Local health URL to hit on target (default: "http://127.0.0.1:${DEPLOY_PORT}/api/me")
#                   A 401 counts as healthy (service is up, just rejecting unauthenticated).
#
# Release layout on target:
#   ${DEPLOY_BASE}/
#     ├─ releases/<TS>/          timestamped, kept for rollback (3 most recent)
#     ├─ current -> releases/<TS>
#     └─ shared/
#         ├─ .env                chmod 600, persistent across deploys
#         └─ data/testrun.db       SQLite file, persistent across deploys

set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required (set to SSH alias or hostname)}"
DEPLOY_USER="${DEPLOY_USER:-openape}"
DEPLOY_BASE="${DEPLOY_BASE:-/home/${DEPLOY_USER}/projects/openape-testrun}"
DEPLOY_PORT="${DEPLOY_PORT:-3006}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-openape-testrun.service}"
DEPLOY_HEALTH="${DEPLOY_HEALTH:-http://127.0.0.1:${DEPLOY_PORT}/api/me}"

TS=$(date -u +%Y-%m-%dT%H-%M-%S)
TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "→ Build app (.output/)"
pnpm --filter @openape-testrun/app build

echo "→ Ensure target directory layout"
ssh "${TARGET}" "mkdir -p ${DEPLOY_BASE}/releases ${DEPLOY_BASE}/shared/data"

echo "→ Rsync release to ${TARGET}:${DEPLOY_BASE}/releases/${TS}/"
rsync -az --delete \
  app/.output/ \
  "${TARGET}:${DEPLOY_BASE}/releases/${TS}/"

echo "→ Pin matching @libsql/linux-x64-gnu native binding"
# The libsql wrapper carries a pinned version; the optional native package
# must match. Repin here to avoid glibc/prebuild mismatches on deploy targets
# running older Linux distros.
LIBSQL_PIN="${LIBSQL_PIN:-0.4.7}"
ssh "${TARGET}" bash -s <<REMOTE
set -euo pipefail
cd /tmp
rm -rf libsql-pkg && mkdir libsql-pkg && cd libsql-pkg
npm pack @libsql/linux-x64-gnu@${LIBSQL_PIN} >/dev/null 2>&1
tar -xzf libsql-linux-x64-gnu-${LIBSQL_PIN}.tgz
mkdir -p ${DEPLOY_BASE}/releases/${TS}/server/node_modules/@libsql/linux-x64-gnu
cp package/* ${DEPLOY_BASE}/releases/${TS}/server/node_modules/@libsql/linux-x64-gnu/
REMOTE

echo "→ Swap current symlink"
ssh "${TARGET}" "ln -sfn ${DEPLOY_BASE}/releases/${TS} ${DEPLOY_BASE}/current"

echo "→ Restart ${DEPLOY_SERVICE}"
ssh "${TARGET}" "sudo systemctl restart ${DEPLOY_SERVICE}"

echo "→ Wait for local health (${DEPLOY_HEALTH})"
ssh "${TARGET}" "
  for i in 1 2 3 4 5 6 7 8 9 10; do
    status=\$(curl -s -o /dev/null -w '%{http_code}' ${DEPLOY_HEALTH} || echo '000')
    if [ \"\$status\" = '200' ] || [ \"\$status\" = '401' ]; then
      echo 'up after '\$i's (HTTP '\$status')'
      exit 0
    fi
    sleep 1
  done
  echo 'health check failed after 10s'
  sudo journalctl -u ${DEPLOY_SERVICE} -n 30 --no-pager
  exit 1
"

echo "→ Prune old releases (keep last 3)"
ssh "${TARGET}" "ls -1t ${DEPLOY_BASE}/releases/ | tail -n +4 | xargs -r -I{} rm -rf ${DEPLOY_BASE}/releases/{}"

echo
echo "✓ Deployed ${TS} (release ${DEPLOY_BASE}/releases/${TS})"
