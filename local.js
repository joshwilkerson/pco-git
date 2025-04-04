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

  // Use pbcopy to copy the full path to the clipboard on macOS
  exec(`echo "${fullPath}" | pbcopy`, (copyError, copyStdout, copyStderr) => {
    if (copyError) {
      console.error(`Error copying to clipboard: ${copyError.message}`)
      process.exit(1)
    }
    if (copyStderr) {
      console.error(`pbcopy stderr: ${copyStderr}`)
    }
    console.log(`Copied ${fullPath} to clipboard`)
  })
})
