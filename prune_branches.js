import { multiselect, log, outro, spinner, confirm } from "@clack/prompts"
import { exec } from "child_process"
import util from "util"
import color from "picocolors"

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

    // Determine the remote primary branch.
    let remotePrimary = "origin/main" // default fallback
    try {
      const { stdout: remotePrimaryOutput } = await execPromise(
        "git symbolic-ref refs/remotes/origin/HEAD"
      )
      remotePrimary = remotePrimaryOutput.trim().replace("refs/remotes/", "")
    } catch (err) {
      log.warn(
        "Could not determine remote primary branch, defaulting to origin/main."
      )
    }

    // Get formatted local branch info: branch name and upstream (if any)
    const { stdout: formattedBranches } = await execPromise(
      'git branch --format "%(refname:short) %(upstream)"'
    )

    // Filter for branches with no upstream (i.e. prunable branches)
    const branchesToPrune = formattedBranches
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => {
        const parts = line.split(/\s+/)
        return { branch: parts[0], upstream: parts[1] || "" }
      })
      .filter(({ upstream }) => upstream === "")

    if (branchesToPrune.length === 0) {
      log.warn("No local branches found that are gone from remote.")
      return
    }

    // For each prunable branch, get the commit diff relative to the remote primary branch.
    const options = await Promise.all(
      branchesToPrune.map(async ({ branch }) => {
        let ahead = "N/A"
        let behind = "N/A"
        try {
          const { stdout: diffOutput } = await execPromise(
            `git rev-list --left-right --count ${branch}...${remotePrimary}`
          )
          // The output is something like "5    3"
          const [a, b] = diffOutput.trim().split(/\s+/)
          ahead = a
          behind = b
        } catch (err) {
          log.warn(`Could not compute diff for branch ${branch}`)
        }
        return {
          label: `${branch} (${color.green("↑" + ahead)} / ${color.red(
            "↓" + behind
          )})`,
          value: branch,
        }
      })
    )

    // Allow the user to select which branches to delete via a multi-select prompt
    const branchesToDelete = await multiselect({
      message: "Select branches to delete:",
      options,
    })

    if (!branchesToDelete || branchesToDelete.length === 0) {
      log.warn("No branches selected for deletion.")
      return
    }

    // Log the confirmation section like "Upstream repositories:"
    log.info("The following branches will be deleted:")
    branchesToDelete.forEach((branch) => {
      log.info(`- ${branch}`)
    })

    // Ask for confirmation
    const deletionConfirmed = await confirm({
      message: "Are you sure you want to proceed?",
    })
    if (!deletionConfirmed) {
      log.info("Deletion cancelled.")
      return
    }

    // Use a spinner for the deletion process
    const deleteSpinner = spinner()
    deleteSpinner.start("Deleting branches...")
    for (const branch of branchesToDelete) {
      log.step(`Deleting branch: ${branch}`)
      await execPromise(`git branch -D ${branch}`)
    }
    deleteSpinner.stop("Branches deleted.")
    outro("Selected branches have been deleted.")
  } catch (error) {
    log.error("Error during prune operation: " + error)
  }
}
