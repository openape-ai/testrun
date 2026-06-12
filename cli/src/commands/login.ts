import { defineCommand } from 'citty'
import { error, info } from '../output.ts'

/**
 * Stub. ape-testruns does not manages its own login flow — auth is shared
 * across all OpenApe CLIs via `@openape/cli-auth`, which reads the IdP
 * token written by `apes login` (`~/.config/apes/auth.json`).
 */
export const loginCommand = defineCommand({
  meta: {
    name: 'login',
    description: 'DEPRECATED — use `apes login <email>` instead.',
  },
  args: {
    email: {
      type: 'positional',
      required: false,
      description: 'Ignored.',
    },
  },
  async run() {
    info('ape-testruns uses the unified `apes` auth session.')
    info('')
    info('Run `apes login <email>` once on this device, then `ape-testruns …` works')
    info('without per-CLI authentication. The same `apes login` covers ape-plans,')
    info('upcoming ape-secrets / ape-seeds, and any future OpenApe SP CLI.')
    info('')
    error('No-op: ape-testruns login is a stub.')
    process.exit(1)
  },
})
