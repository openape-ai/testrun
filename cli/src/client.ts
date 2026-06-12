/**
 * Shared SP client instance for testrun.openape.ai.
 *
 * Single call-site for createSpClient — all command modules import from
 * here rather than reaching into @openape/cli-auth directly. Auth is the
 * unified apes session: `apes login` once per device, this client exchanges
 * the IdP token via POST /api/cli/exchange and caches the SP token.
 */
import { createSpClient } from '@openape/cli-auth'
import type { SpClientState } from '@openape/cli-auth'

export type TestrunState = SpClientState

export const testrunClient = createSpClient<TestrunState>({
  defaultEndpoint: 'https://testrun.openape.ai',
  envVar: 'APE_TESTRUNS_ENDPOINT',
  configFile: 'auth-testruns.json',
  defaultAud: 'testrun.openape.ai',
})

export const {
  configPath,
  resolveEndpoint,
  loadConfig,
  saveConfig,
  apiCall: _apiCall,
  _request,
} = testrunClient
