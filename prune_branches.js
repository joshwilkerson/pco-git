import { select, confirm, log, outro, spinner } from "@clack/prompts"
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

    // Process each prunable branch individually
    for (const { branch } of branchesToPrune) {
      // Get commit diff counts for branch relative to remotePrimary.
      let ahead = "N/A"
      let behind = "N/A"
      try {
        const { stdout: diffOutput } = await execPromise(
          `git rev-list --left-right --count ${branch}...${remotePrimary}`
        )
        // diffOutput returns something like "5    3"
        const [a, b] = diffOutput.trim().split(/\s+/)
        ahead = a
        behind = b
      } catch (err) {
        log.warn(`Could not compute diff for branch ${branch}`)
      }

      // Provide a nested prompt for the branch.
      const action = await select({
        message: `Branch: ${branch} (${color.green("↑" + ahead)} / ${color.red(
          "↓" + behind
        )})`,
        options: [
          { label: "Delete local branch", value: "delete" },
          { label: "See diff", value: "diff" },
          { label: "Skip", value: "skip" },
        ],
      })

      if (action === "delete") {
        log.step(`Deleting branch: ${branch}`)
        await execPromise(`git branch -D ${branch}`)
      } else if (action === "diff") {
        // Retrieve detailed commit logs for the diff.
        let aheadCommits = ""
        let behindCommits = ""
        try {
          const { stdout: aheadOutput } = await execPromise(
            `git log --oneline ${remotePrimary}..${branch}`
          )
          aheadCommits = aheadOutput.trim()
        } catch (err) {
          aheadCommits = "Could not retrieve ahead commits."
        }
        try {
          const { stdout: behindOutput } = await execPromise(
            `git log --oneline ${branch}..${remotePrimary}`
          )
          behindCommits = behindOutput.trim()
        } catch (err) {
          behindCommits = "Could not retrieve behind commits."
        }

        log.info(`\nDiff for branch ${branch}:`)
        log.info(`${color.green("Commits ahead:")}\n${aheadCommits || "None"}`)
        log.info(`${color.red("Commits behind:")}\n${behindCommits || "None"}`)

        // Ask if the user wants to delete the branch after viewing diff.
        const confirmDelete = await confirm({
          message: `Do you want to delete branch ${branch}?`,
        })
        if (confirmDelete) {
          log.step(`Deleting branch: ${branch}`)
          await execPromise(`git branch -D ${branch}`)
        } else {
          log.info(`Skipping deletion for branch: ${branch}`)
        }
      } else if (action === "skip") {
        log.info(`Skipping branch: ${branch}`)
      }
    }

    outro("Done processing prunable branches.")
  } catch (error) {
    log.error("Error during prune operation: " + error)
  }
}
