#!/usr/bin/env node

import { exec } from "child_process"
import path from "path"

exec("npm pack", (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing npm pack: ${error.message}`)
    process.exit(1)
  }
  if (stderr) {
    console.error(`npm pack stderr: ${stderr}`)
  }
  const filename = stdout.trim()
  const fullPath = path.resolve(process.cwd(), filename)
  console.log(`Created package: ${fullPath}`)

  const installCommand = `npm i -g ${fullPath}`
  console.log(`Running: ${installCommand}`)

  exec(installCommand, (installError, installStdout, installStderr) => {
    if (installError) {
      console.error(`Error installing package: ${installError.message}`)
      process.exit(1)
    }
    if (installStderr) {
      console.error(`npm install stderr: ${installStderr}`)
    }
    console.log(`Installed package globally:\n${installStdout}`)
  })
})
