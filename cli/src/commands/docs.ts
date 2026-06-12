import { defineCommand } from 'citty'
import agent from '../docs/agent.md'
import auth from '../docs/auth.md'
import cli from '../docs/cli.md'
import manifest from '../docs/manifest.md'
import { printLine } from '../output.ts'

const DOCS: Record<string, string> = {
  agent,
  auth,
  cli,
  manifest,
}

/**
 * Print full documentation. Useful for agents that need the reference without
 * web access.
 *
 * EXAMPLES
 *   $ ape-testruns docs             # lists topics
 *   $ ape-testruns docs agent       # agent-focused end-to-end workflow
 *   $ ape-testruns docs manifest    # testrun.json format
 */
export const docsCommand = defineCommand({
  meta: {
    name: 'docs',
    description: 'Print documentation. Topics: agent, auth, cli, manifest.',
  },
  args: {
    topic: { type: 'positional', required: false, description: 'Topic name. Omit to list topics.' },
  },
  async run({ args }) {
    if (!args.topic) {
      printLine('Available topics:')
      for (const key of Object.keys(DOCS).sort()) printLine(`  ${key}`)
      printLine('')
      printLine('Example: `ape-testruns docs agent`')
      return
    }
    const doc = DOCS[args.topic.toLowerCase()]
    if (!doc) {
      printLine(`No such topic "${args.topic}". Available: ${Object.keys(DOCS).sort().join(', ')}.`)
      process.exit(1)
    }
    process.stdout.write(doc.endsWith('\n') ? doc : `${doc}\n`)
  },
})
