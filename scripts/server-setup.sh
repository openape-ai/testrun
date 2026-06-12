#!/usr/bin/env bash
#
# One-shot server setup for the plans app. Run ONCE as root on the target host.
# Idempotent: safe to rerun; existing files are preserved.
#
# What it does:
#   - Creates /home/$DEPLOY_USER/projects/openape-testrun/{releases,shared/data}
#   - Installs /etc/systemd/system/$DEPLOY_SERVICE systemd unit
#   - Extends /etc/sudoers.d/openape-testrun to allow restart
#   - Writes a shared .env template (operator fills in)
#   - Installs an nginx vhost (HTTP) for $PUBLIC_HOST and reloads nginx
#
# Env:
#   DEPLOY_USER=openape      (Unix user that owns the app)
#   DEPLOY_SERVICE=openape-testrun.service
#   DEPLOY_PORT=3006
#   PUBLIC_HOST=testrun.openape.ai
#
# After this script, run `certbot --nginx -d $PUBLIC_HOST` to attach TLS.
# Then trigger the Deploy workflow in GitHub to push the first release.

set -euo pipefail

if [ "$(id -u)" != "0" ]; then
  echo "run as root" >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-openape}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-openape-testrun.service}"
DEPLOY_PORT="${DEPLOY_PORT:-3006}"
PUBLIC_HOST="${PUBLIC_HOST:-testrun.openape.ai}"
BASE="/home/${DEPLOY_USER}/projects/openape-testrun"

echo "→ Ensure $DEPLOY_USER exists"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || {
  echo "user $DEPLOY_USER missing — create it first (see docs/deploy.md)" >&2
  exit 1
}

echo "→ Create directories"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$BASE"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 "$BASE/releases"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$BASE/shared"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 750 "$BASE/shared/data"

echo "→ Write .env template (if missing)"
if [ ! -f "$BASE/shared/.env" ]; then
  cat >"$BASE/shared/.env" <<EOF
# App config — chmod 600. Deploys read this via EnvironmentFile.
NODE_ENV=production
PORT=${DEPLOY_PORT}
HOST=127.0.0.1

# SQLite file (libsql). Persistent across deploys.
# The NUXT_ prefix is required — Nitro only maps runtimeConfig overrides
# from NUXT_-prefixed env vars. Plain TURSO_URL is silently ignored and
# the app falls back to the bundled default (file:./dev.db inside the
# release dir), which would nuke data on every deploy.
NUXT_TURSO_URL=file:$BASE/shared/data/testrun.db
NUXT_TURSO_AUTH_TOKEN=

# Secrets (rotate by changing here and restarting the service).
# NUXT_OPENAPE_SP_* maps to the @openape/nuxt-auth-sp runtime config —
# the canonical way to override SP settings at runtime.
NUXT_OPENAPE_SP_SESSION_SECRET=replace-me-at-least-32-characters-long-xxxxx

# OpenApe SP
NUXT_OPENAPE_SP_CLIENT_ID=${PUBLIC_HOST}
NUXT_OPENAPE_SP_FALLBACK_IDP_URL=https://id.openape.ai
NUXT_PUBLIC_URL=https://${PUBLIC_HOST}
EOF
  chown "$DEPLOY_USER:$DEPLOY_USER" "$BASE/shared/.env"
  chmod 600 "$BASE/shared/.env"
  echo "   .env created — edit $BASE/shared/.env and set real secrets!"
else
  echo "   .env already present, leaving it alone"
fi

echo "→ Install systemd unit"
cat >"/etc/systemd/system/${DEPLOY_SERVICE}" <<EOF
[Unit]
Description=OpenApe Testrun (Nuxt)
After=network.target

[Service]
Type=simple
User=${DEPLOY_USER}
Group=${DEPLOY_USER}
WorkingDirectory=${BASE}/current
EnvironmentFile=${BASE}/shared/.env
ExecStart=/usr/bin/node ${BASE}/current/server/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${BASE}/shared
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$DEPLOY_SERVICE"

echo "→ Extend sudoers (idempotent)"
SUDOERS_FILE="/etc/sudoers.d/openape-testrun"
cat >"$SUDOERS_FILE" <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /bin/systemctl restart ${DEPLOY_SERVICE}
EOF
chmod 440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE"

echo "→ Install nginx vhost (HTTP only — certbot takes over for TLS)"
NGINX_SITE="/etc/nginx/sites-available/${PUBLIC_HOST}"
cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name ${PUBLIC_HOST};

    location / {
        proxy_pass http://127.0.0.1:${DEPLOY_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF
ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/${PUBLIC_HOST}"
nginx -t
systemctl reload nginx

echo
echo "✓ Server setup done."
echo
echo "Next steps:"
echo "  1. Edit ${BASE}/shared/.env and replace every 'replace-me-...' with real 32+ char secrets"
echo "     openssl rand -hex 32"
echo "  2. certbot --nginx -d ${PUBLIC_HOST}"
echo "  3. In GitHub repo variables set:"
echo "       DEPLOY_HOST=<your-host>  DEPLOY_PUBLIC_URL=https://${PUBLIC_HOST}"
echo "     Optional (have sensible defaults):"
echo "       DEPLOY_USER=${DEPLOY_USER}  DEPLOY_PORT=${DEPLOY_PORT}  DEPLOY_SERVICE=${DEPLOY_SERVICE}"
echo "  4. In GitHub repo secrets set:"
echo "       DEPLOY_SSH_KEY    (private ed25519 key authorized for ${DEPLOY_USER}@<host>)"
echo "       DEPLOY_KNOWN_HOSTS (output of: ssh-keyscan <host>)"
echo "  5. Trigger the Deploy workflow (workflow_dispatch) — first deploy creates releases/ and swaps the symlink."
