#!/usr/bin/env node
import {
  multiselect,
  log,
  outro,
  spinner,
  confirm,
  text,
  cancel,
  isCancel,
} from "@clack/prompts"
import { exec } from "child_process"
import util from "util"
import color from "picocolors"

const execPromise = util.promisify(exec)

export async function pruneBranches() {
  let gitRoot = ""
  try {
    const { stdout: gitRootOutput } = await execPromise(
      "git rev-parse --show-toplevel"
    )
    gitRoot = gitRootOutput.trim()

    const { stdout: remoteOutput } = await execPromise("git remote -v")
    const gitInfo = `Local repository: ${gitRoot}\n\nUpstream repository:\n${remoteOutput.trim()}`
    log.info(gitInfo)
  } catch (error) {
    log.error("Not a git repository.")
    return
  }

  try {
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

    // Get list of local branches.
    const { stdout: localBranchesOutput } = await execPromise(
      'git branch --format="%(refname:short)"'
    )
    const localBranches = localBranchesOutput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .sort()

    // Get list of remote branches (stripping the "origin/" prefix).
    const { stdout: remoteBranchesOutput } = await execPromise(
      'git branch -r --format="%(refname:short)"'
    )
    const remoteBranches = remoteBranchesOutput
      .split("\n")
      .map((line) => line.trim().replace(/^origin\//, ""))
      .filter((line) => line !== "")
      .sort()

    // Identify orphaned branches via comm‑style logic.
    const orphanedBranchesFromComm = localBranches.filter(
      (branch) => !remoteBranches.includes(branch)
    )

    // Also identify branches marked [gone] in verbose output.
    const { stdout: verboseBranchesOutput } = await execPromise(
      "git branch -vv"
    )
    const orphanedBranchesFromGone = verboseBranchesOutput
      .split("\n")
      .map((line) => {
        if (line.includes("[gone]")) {
          const parts = line.trim().split(/\s+/)
          return parts[0] === "*" ? parts[1] : parts[0]
        }
      })
      .filter(Boolean)

    // Combine both lists, removing duplicates.
    const orphanedBranches = Array.from(
      new Set([...orphanedBranchesFromComm, ...orphanedBranchesFromGone])
    )

    if (orphanedBranches.length === 0) {
      log.warn("👍 No local branches found that are not present upstream.")
      return
    }

    // For each orphaned branch, get the diff info and last commit date.
    const options = await Promise.all(
      orphanedBranches.map(async (branch) => {
        let ahead = "N/A"
        let behind = "N/A"
        try {
          const { stdout: diffOutput } = await execPromise(
            `git rev-list --left-right --count ${branch}...${remotePrimary}`
          )
          const [a, b] = diffOutput.trim().split(/\s+/)
          ahead = a
          behind = b
        } catch (err) {
          log.warn(`Could not compute diff for branch ${branch}`)
        }
        let lastCommitDate = "N/A"
        try {
          const { stdout: dateOutput } = await execPromise(
            `git log -1 --format=%cd ${branch}`
          )
          const rawDate = dateOutput.trim()
          const parsedDate = new Date(rawDate)
          lastCommitDate = parsedDate
            .toLocaleString("en-US", {
              month: "numeric",
              day: "numeric",
              year: "2-digit",
              hour: "numeric",
              minute: "numeric",
              hour12: true,
            })
            .replace(",", "")
        } catch (err) {
          log.warn(`Could not retrieve last commit date for branch ${branch}`)
        }
        return {
          label: `${branch} (last commit: ${lastCommitDate} | diff: ${color.green(
            "↑" + ahead
          )} ${color.red("↓" + behind)})`,
          value: branch,
        }
      })
    )

    const branchesToDelete = await multiselect({
      message: "Select branches to delete:",
      options,
    })

    if (!branchesToDelete || branchesToDelete.length === 0) {
      log.warn("No branches selected for deletion.")
      return
    }

    const branchList = branchesToDelete
      .map((branch) => `  - ${branch}`)
      .join("\n")
    log.info(`The following branches will be deleted:\n${branchList}`)

    const deletionConfirmed = await confirm({
      message: "⚠️  Are you sure you want to proceed?",
    })
    if (!deletionConfirmed) {
      log.info("Deletion cancelled.")
      return
    }

    // Before deletion, ensure we're on the main branch.
    const { stdout: currentBranchOutput } = await execPromise(
      "git rev-parse --abbrev-ref HEAD"
    )
    const currentBranch = currentBranchOutput.trim()
    if (currentBranch !== "main") {
      const switchSpinner = spinner()
      switchSpinner.start("Switching to main branch...")

      // Check for uncommitted changes.
      const { stdout: statusOutput } = await execPromise(
        "git status --porcelain"
      )
      let stashMessage = ""
      if (statusOutput.trim() !== "") {
        stashMessage = await text({
          message: "You have uncommitted changes. Add a stash message:",
        })
        if (isCancel(stashMessage)) {
          cancel("Operation cancelled.")
          process.exit(0)
        }
      }
      if (stashMessage) {
        await execPromise(`git stash push -m "${stashMessage}"`)
      }
      await execPromise("git checkout main")
      switchSpinner.stop("Switched to main branch.")
    }

    const deleteSpinner = spinner()
    deleteSpinner.start("Deleting local branches...")
    for (const branch of branchesToDelete) {
      log.step(`Deleting local branch: ${branch}`)
      await execPromise(`git branch -D ${branch}`)
    }
    deleteSpinner.stop("")
    outro("Selected branches have been deleted.")
  } catch (error) {
    log.error("Error during prune operation: " + error)
  }
}
