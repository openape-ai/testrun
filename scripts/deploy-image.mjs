#!/usr/bin/env node
// Tested-image prod deploy (mirrors the monorepo's scripts/deploy-image.mjs):
// build .output natively, package a COPY-only amd64 image, smoke-test it
// locally, push to registry.openape.ai, then chatty pulls + restarts the
// container — with an /api/health gate and tag rollback. No build on chatty.
//
//   node scripts/deploy-image.mjs
//
// Prereqs: `docker login registry.openape.ai` (push creds live on chatty in
// /home/openape/registry/push-credentials.txt) and SSH access as openape.
//
// One-time cutover guard: refuses to deploy while the systemd unit is still
// active (port conflict) — stop + disable it first (as ubuntu); it stays as
// the dormant emergency fallback.

import { execFileSync } from 'node:child_process'
import process from 'node:process'

const APP = {
  filter: '@openape-testrun/app',
  outputDir: 'app/.output',
  image: 'openape-testrun',
  port: 3006,
  compose: 'testrun',
  unit: 'openape-testrun',
  domain: 'testrun.openape.ai',
  envVar: 'TESTRUN_TAG',
  prodDir: '/home/openape/prod-testrun',
}

const REGISTRY = 'registry.openape.ai'
const HOST = process.env.CHATTY_HOST || 'chatty.delta-mind.at'
const USER = process.env.CHATTY_USER || 'openape'

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}
function out(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim()
}
function ssh(script) {
  return execFileSync('ssh', ['-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes', `${USER}@${HOST}`, 'bash', '-s'], {
    input: script,
    encoding: 'utf8',
  }).trim()
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function smokeTest(tag) {
  const name = `smoke-${APP.port}`
  try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }) }
  catch {}
  sh('docker', [
    'run', '-d', '--name', name, '--platform', 'linux/amd64',
    '-p', `127.0.0.1:1${APP.port}:${APP.port}`,
    '-e', 'NUXT_OPENAPE_SP_SESSION_SECRET=smoke-test-session-secret-0000000000',
    '-e', 'NUXT_TURSO_URL=file:/tmp/smoke.db',
    tag,
  ])
  try {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:1${APP.port}/api/health`)
        if (res.ok && (await res.json()).ok === true)
          return
      }
      catch {}
      await sleep(2000)
    }
    throw new Error(`smoke test failed: /api/health never returned ok on :1${APP.port}`)
  }
  finally {
    try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }) }
    catch {}
  }
}

async function externalHealth() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`https://${APP.domain}/api/health`, { signal: AbortSignal.timeout(8000) })
      if (res.ok && (await res.json()).ok === true)
        return true
    }
    catch {}
    await sleep(3000)
  }
  return false
}

const sha = out('git', ['rev-parse', '--short', 'HEAD'])
const tag = `${REGISTRY}/${APP.image}:prod-${sha}`
console.log(`━━━ ${APP.image} → ${tag}`)

const unitActive = ssh(`systemctl is-active ${APP.unit} 2>/dev/null || true`)
if (unitActive === 'active') {
  throw new Error(
    `systemd unit ${APP.unit} is still active on chatty — one-time cutover needed first:\n`
    + `  (as ubuntu) sudo systemctl stop ${APP.unit} && sudo systemctl disable ${APP.unit}\n`
    + `then re-run this deploy. Emergency fallback stays: sudo systemctl start ${APP.unit}.`,
  )
}

console.log(`→ build ${APP.filter}`)
sh('pnpm', ['--filter', APP.filter, 'build'])
console.log('→ package (amd64, COPY-only)')
sh('docker', ['buildx', 'build', '--platform', 'linux/amd64', '-f', 'compose/package.Dockerfile', '--build-arg', `PORT=${APP.port}`, '-t', tag, '--load', APP.outputDir])
console.log('→ smoke test')
await smokeTest(tag)
// Docker 28 (GitHub runners) never re-sends credentials after the registry's
// 401 challenge because the anonymous-GET /v2/ ping defeats its auth setup;
// docker ≥29 (Mac, chatty) handles it. Ship the image to chatty and push
// host-side — works from every client version and needs no registry secret.
console.log('→ ship image to chatty + push to registry')
sh('bash', ['-c', `docker save ${tag} | gzip | ssh -o ConnectTimeout=15 -o BatchMode=yes ${USER}@${HOST} 'gunzip | docker load'`])
ssh(`
  set -euo pipefail
  PASS=$(grep -E '^pass' /home/openape/registry/push-credentials.txt | cut -d' ' -f2)
  echo "$PASS" | docker login registry.openape.ai -u openape --password-stdin >/dev/null 2>&1
  docker push ${tag} >/dev/null
  echo pushed
`)

console.log('→ chatty: sync compose, pin tag, pull + up')
ssh(`mkdir -p ${APP.prodDir}`)
sh('scp', ['-q', 'compose/chatty.yml', `${USER}@${HOST}:${APP.prodDir}/docker-compose.yml`])
const prev = ssh(`
  set -euo pipefail
  cd ${APP.prodDir}
  touch .env
  OLD=$(grep -E '^${APP.envVar}=' .env | cut -d= -f2- || true)
  grep -vE '^${APP.envVar}(_PREV)?=' .env > .env.new || true
  if [ -n "$OLD" ]; then echo "${APP.envVar}_PREV=$OLD" >> .env.new; fi
  echo "${APP.envVar}=prod-${sha}" >> .env.new
  mv .env.new .env
  docker compose --env-file .env -f docker-compose.yml pull -q ${APP.compose}
  docker compose --env-file .env -f docker-compose.yml up -d ${APP.compose}
  echo "$OLD"
`)

console.log(`→ health gate https://${APP.domain}/api/health`)
if (await externalHealth()) {
  console.log(`✓ deployed (prod-${sha}${prev ? `, prev ${prev}` : ''})`)
}
else {
  console.error('✗ health gate failed — rolling back')
  if (prev) {
    ssh(`
      set -euo pipefail
      cd ${APP.prodDir}
      grep -vE '^${APP.envVar}=' .env > .env.new || true
      echo "${APP.envVar}=${prev}" >> .env.new
      mv .env.new .env
      docker compose --env-file .env -f docker-compose.yml up -d ${APP.compose}
    `)
    console.error(`→ rolled back to ${prev}`)
  }
  else {
    console.error(`→ no previous tag — emergency fallback: (as ubuntu) sudo systemctl start ${APP.unit}`)
  }
  process.exit(1)
}
