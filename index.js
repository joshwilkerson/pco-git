#!/usr/bin/env node
import { intro, outro, select, multiselect, log } from "@clack/prompts"
import { exec } from "child_process"
import util from "util"

// Promisify exec for async/await usage
const execPromise = util.promisify(exec)

async function pruneBranches() {
  // Show the current working directory
  const cwd = process.cwd()
  log.info(`Current working directory: ${cwd}`)

  // Check if we're in a Git repository by getting the repo's root directory
  let gitRoot = ""
  try {
    const { stdout: gitRootOutput } = await execPromise(
      "git rev-parse --show-toplevel"
    )
    gitRoot = gitRootOutput.trim()
    log.info(`Git repository root: ${gitRoot}`)

    // Get and display upstream remote information
    const { stdout: remoteOutput } = await execPromise("git remote -v")
    log.info("Upstream repositories:")
    log.info(remoteOutput)
  } catch (error) {
    log.error(`Not a git repository. Current directory: ${cwd}`)
    return
  }

  try {
    // Update remote information and prune deleted branches
    log.step("Fetching and pruning remote branches...")
    await execPromise("git fetch --prune")

    // Get local branches with verbose info
    const { stdout } = await execPromise("git branch -vv")
    const lines = stdout.split("\n")

    // Find branches whose upstream tracking branch is gone
    const branchesToPrune = []
    for (const line of lines) {
      if (line.includes("[gone]")) {
        // Remove any leading '*' and extract the branch name (first token)
        const branchName = line.replace("*", "").trim().split(" ")[0]
        branchesToPrune.push(branchName)
      }
    }

    if (branchesToPrune.length === 0) {
      log.warn("No local branches found that are gone from remote.")
      return
    }

    // Allow the user to select which branches to delete via a multi-select prompt
    const branchesToDelete = await multiselect({
      message: "Select branches to delete:",
      options: branchesToPrune.map((branch) => ({
        label: branch,
        value: branch,
      })),
    })

    if (!branchesToDelete || branchesToDelete.length === 0) {
      log.warn("No branches selected for deletion.")
      return
    }

    // Delete each selected branch
    for (const branch of branchesToDelete) {
      log.step(`Deleting branch: ${branch}`)
      await execPromise(`git branch -D ${branch}`)
    }

    outro("Selected branches have been deleted.")
  } catch (error) {
    log.error("Error during prune operation: " + error)
  }
}

async function main() {
  intro("Welcome to pco-git CLI")

  const option = await select({
    message: "Please choose an option:",
    options: [
      { label: "Prune branches", value: "prune" },
      { label: "Option 2", value: "2" },
    ],
  })

  if (option === "prune") {
    await pruneBranches()
  } else if (option === "2") {
    log.info("You chose Option 2.")
  } else {
    log.warn("No valid option selected.")
  }

  outro("Exiting pco-git CLI")
}

main()
