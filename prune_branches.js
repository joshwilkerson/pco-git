import { multiselect, log, outro, spinner } from "@clack/prompts"
import { exec } from "child_process"
import util from "util"

// Promisify exec for async/await usage
const execPromise = util.promisify(exec)

export async function pruneBranches() {
  // Check if we're in a Git repository by getting the repo's root directory
  let gitRoot = ""
  try {
    const { stdout: gitRootOutput } = await execPromise(
      "git rev-parse --show-toplevel"
    )
    gitRoot = gitRootOutput.trim()

    // Get upstream remote information
    const { stdout: remoteOutput } = await execPromise("git remote -v")
    const gitInfo = `Git repository root: ${gitRoot}\nUpstream repositories:\n${remoteOutput.trim()}`
    log.info(gitInfo)
  } catch (error) {
    log.error("Not a git repository.")
    return
  }

  try {
    // Use spinner for fetching remote branches
    const s = spinner()
    s.start("Fetching remote branches...")
    await execPromise("git fetch --prune")
    s.stop("Fetched remote branches")

    const { stdout: formattedBranches } = await execPromise(
      'git branch --format "%(refname:short) %(upstream)"'
    )

    const branchesToPrune = formattedBranches
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => {
        // Split on whitespace.
        const parts = line.split(/\s+/)
        return { branch: parts[0], upstream: parts[1] || "" }
      })
      // Only keep branches that do not have an upstream.
      .filter(({ upstream }) => upstream === "")

    if (branchesToPrune.length === 0) {
      log.warn("No local branches found that are gone from remote.")
      return
    }

    // Allow the user to select which branches to delete via a multi-select prompt.
    const branchesToDelete = await multiselect({
      message: "Select branches to delete:",
      options: branchesToPrune.map(({ branch }) => ({
        label: branch,
        value: branch,
      })),
    })

    if (!branchesToDelete || branchesToDelete.length === 0) {
      log.warn("No branches selected for deletion.")
      return
    }

    // Delete each selected branch.
    for (const branch of branchesToDelete) {
      log.step(`Deleting branch: ${branch}`)
      await execPromise(`git branch -D ${branch}`)
    }

    outro("Selected branches have been deleted.")
  } catch (error) {
    log.error("Error during prune operation: " + error)
  }
}
