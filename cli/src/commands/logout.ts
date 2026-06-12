import { clearSpToken } from '@openape/cli-auth'
import { defineCommand } from 'citty'
import { existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveEndpoint } from '../client.ts'
import { info } from '../output.ts'

/**
 * Drop the cached SP-token for testrun.openape.ai. Doesn't touch the IdP
 * session — that's owned by `apes login` / `apes logout`. Use
 * `--legacy` to also delete the pre-1.0 `~/.openape/auth-testruns.json`
 * file if it's still hanging around from before the SSO refactor.
 */
export const logoutCommand = defineCommand({
  meta: {
    name: 'logout',
    description: 'Forget the cached testrun SP-token (does NOT log you out of `apes`).',
  },
  args: {
    endpoint: { type: 'string', description: 'Override testrun endpoint.' },
    legacy: { type: 'boolean', description: 'Also delete the legacy ~/.openape/auth-testruns.json file.' },
  },
  async run({ args }) {
    const endpoint = resolveEndpoint(args.endpoint)
    const aud = (() => {
      try { return new URL(endpoint).host }
      catch { return 'testrun.openape.ai' }
    })()
    clearSpToken(aud)
    info(`Cleared testrun SP-token cache for ${endpoint}.`)

    if (args.legacy) {
      const legacy = join(homedir(), '.openape', 'auth-testruns.json')
      if (existsSync(legacy)) {
        unlinkSync(legacy)
        info(`Removed legacy ${legacy}.`)
      }
      else {
        info('No legacy auth-testruns.json to remove.')
      }
    }

    info('IdP session (~/.config/apes/auth.json) untouched. Run `apes logout` to clear it.')
  },
})
