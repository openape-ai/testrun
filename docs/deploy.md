# Deploying the plans app

This guide is host-agnostic. Every host-specific value is env-driven, so the
same script works for prod, staging, and a self-hosted instance on your own
box.

## 1. Prerequisites on the target host

- A Linux box with `node 22+`, `npm`, `nginx`, and `certbot` installed.
- A dedicated Unix user that owns the app. `openape` is the default; any
  unprivileged user works.
- SSH key auth for that user from wherever you run the deploy script (or
  from GitHub Actions via `DEPLOY_SSH_KEY`).

Create the user if needed:

```bash
sudo useradd -m -s /bin/bash openape
sudo mkdir -p /home/openape/.ssh
sudo tee /home/openape/.ssh/authorized_keys <<<'ssh-ed25519 AAAA... your-deploy-key'
sudo chown -R openape:openape /home/openape/.ssh
sudo chmod 700 /home/openape/.ssh
sudo chmod 600 /home/openape/.ssh/authorized_keys
```

## 2. Run server-setup.sh once

```bash
# as root on the target host
export DEPLOY_USER=openape
export DEPLOY_SERVICE=openape-testrun.service
export DEPLOY_PORT=3006
export PUBLIC_HOST=testrun.openape.ai

curl -fsSL https://raw.githubusercontent.com/openape-ai/tasks/main/scripts/server-setup.sh | bash
# or: sudo bash scripts/server-setup.sh after cloning the repo
```

This creates the release directory layout, the systemd unit, sudoers rule,
shared `.env` template, and an nginx vhost. Read the final output of the
script — it lists the follow-up steps.

Next:

- Fill in `/home/openape/projects/openape-testrun/shared/.env` with 32-char
  secrets (`openssl rand -hex 32` is a good default).
- Attach TLS: `sudo certbot --nginx -d testrun.openape.ai`.

## 3. Configure GitHub

**Secrets** (repo → Settings → Secrets and variables → Actions):

- `DEPLOY_SSH_KEY` — private ed25519 key for the deploy user
- `DEPLOY_KNOWN_HOSTS` — output of `ssh-keyscan <host>`

**Variables** (same page, different tab):

- `DEPLOY_HOST` — hostname or SSH alias of the target
- `DEPLOY_PUBLIC_URL` — full https URL for the health check (default
  `https://testrun.openape.ai`)

Optional overrides (with defaults shown):

- `DEPLOY_USER=openape`
- `DEPLOY_BASE=/home/openape/projects/openape-testrun`
- `DEPLOY_PORT=3006`
- `DEPLOY_SERVICE=openape-testrun.service`

## 4. First deploy

Run the `Deploy` workflow manually (`workflow_dispatch`). On success:

- `${DEPLOY_BASE}/releases/<timestamp>/` holds the built app.
- `${DEPLOY_BASE}/current` symlinks to it.
- `systemctl status openape-testrun.service` shows `active (running)`.
- `curl -fsS https://testrun.openape.ai/api/me` returns `401` (healthy).

Subsequent pushes to `main` that touch `app/**`, `scripts/deploy.sh`,
`pnpm-lock.yaml`, or `.github/workflows/deploy.yml` trigger the same flow.

## 5. Rollback

Automatic: if the health check fails after a deploy, the workflow reattaches
the previous release and restarts the service.

Manual:

```bash
ssh openape@<host>
ls -1 ~/projects/openape-testrun/releases/
ln -sfn ~/projects/openape-testrun/releases/<older-ts> ~/projects/openape-testrun/current
sudo systemctl restart openape-testrun.service
```

## 6. Observability

- `sudo journalctl -u openape-testrun.service -f` — live logs.
- `curl -fsS https://testrun.openape.ai/api/me` — 401 means healthy, anything
  else is a signal.
- Database lives at `${DEPLOY_BASE}/shared/data/testrun.db`. Back it up with
  `sqlite3 testrun.db ".backup /path/to/backup-$(date +%F).db"` on a cron.
