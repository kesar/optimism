/* Imports: External */
import * as dotenv from 'dotenv'
import Config from 'bcfg' // TODO: Add some types for bcfg if we get the chance.

/* Imports: Internal */
import { L1DataTransportService } from './main/service'

interface Bcfg {
  load: (options: { env?: boolean; argv?: boolean }) => void
  str: (name: string, defaultValue?: string) => string
  uint: (name: string, defaultValue?: number) => number
  bool: (name: string, defaultValue?: boolean) => boolean
}

;(async () => {
  try {
    dotenv.config()

    const config: Bcfg = new Config('data-transport-layer')
    config.load({
      env: true,
      argv: true,
    })

    const service = new L1DataTransportService({
      dbPath: config.str('db-path', './db'),
      port: config.uint('server-port', 7878),
      hostname: config.str('server-hostname', 'localhost'),
      confirmations: config.uint('confirmations', 35),
      l1RpcProvider: config.str('l1-rpc-endpoint'),
      addressManager: config.str('address-manager'),
      pollingInterval: config.uint('polling-interval', 5000),
      logsPerPollingInterval: config.uint('logs-per-polling-interval', 2000),
      dangerouslyCatchAllErrors: config.bool(
        'dangerously-catch-all-errors',
        false
      ),
      l2RpcProvider: config.str('l2-rpc-endpoint'),
      l2ChainId: config.uint('l2-chain-id'),
      syncFromL1: config.bool('sync-from-l1', true),
      syncFromL2: config.bool('sync-from-l2', false),
      transactionsPerPollingInterval: config.uint(
        'transactions-per-polling-interval',
        1000
      ),
      legacySequencerCompatibility: config.bool(
        'legacy-sequencer-compatibility',
        false
      ),
      defaultBackend: config.str('default-backend', 'l1'),
      sentryDsn: config.str('sentry-dsn'),
    })

    await service.start()
  } catch (err) {
    console.error(
      `Well, that's that. We ran into a fatal error. Here's the dump. Goodbye!`
    )

    throw err
  }
})()
