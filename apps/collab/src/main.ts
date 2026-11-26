import { resolve } from "node:path"
import { config as dotenvConfig } from "dotenv"
import { ConfigError, loadConfig } from "./config"
import { createCollabServer } from "./server"

// src/ (tsx) and dist/ (node) are both two levels below the repo root
dotenvConfig({ path: resolve(__dirname, "../../../.env") })

async function main() {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message)
      process.exit(1)
    }
    throw error
  }

  const server = createCollabServer(config)
  await server.listen()
  console.log(`cluster-collab listening on port ${config.port}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
