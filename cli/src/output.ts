// Output helpers. Re-exports shared helpers from @openape/cli-auth and
// keeps the tasks-specific stderr helpers (info/error) that are not part
// of the shared surface.
export { printJson, printLine, printNdjson, fmtTime } from '@openape/cli-auth'

export interface OutputOptions {
  json?: boolean
  quiet?: boolean
}

export function info(msg: string, opts: OutputOptions = {}): void {
  if (opts.quiet) return
  process.stderr.write(`${msg}\n`)
}

export function error(msg: string): void {
  process.stderr.write(`error: ${msg}\n`)
}
