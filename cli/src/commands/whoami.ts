import { defineCommand } from 'citty'
import { apiCall } from '../api.ts'
import { resolveEndpoint } from '../client.ts'
import { printJson, printLine } from '../output.ts'

/**
 * Print the current caller identity as seen by the server.
 *
 * EXAMPLE
 *   $ ape-testruns whoami
 *   patrick@example.com (human)  endpoint https://testrun.openape.ai
 *
 *   $ ape-testruns whoami --json
 *   { "email": "patrick@example.com", "act": "human", "endpoint": "https://testrun.openape.ai" }
 */
export const whoamiCommand = defineCommand({
  meta: {
    name: 'whoami',
    description: 'Show the current session identity (email, act, endpoint).',
  },
  args: {
    json: { type: 'boolean', description: 'JSON output.' },
    endpoint: { type: 'string', description: 'Override testrun endpoint.' },
  },
  async run({ args }) {
    const endpoint = resolveEndpoint(args.endpoint)
    const me = await apiCall<{ email: string, act: 'human' | 'agent' }>(
      'GET',
      '/api/cli/me',
      { endpoint },
    )
    const email = me.email ?? 'unknown'
    const act = me.act ?? 'human'

    if (args.json) {
      printJson({ email, act, endpoint })
      return
    }
    printLine(`${email} (${act})  endpoint ${endpoint}`)
  },
})
