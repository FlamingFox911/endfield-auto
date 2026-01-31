import { App } from './App.js'
import { logger } from '../utils/logger.js'

const app = new App()
app.start().catch((error) => {
  logger.error('Fatal error', { error })
  process.exitCode = 1
})
