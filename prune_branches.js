import { multiselect, log, outro, spinner, confirm } from "@clack/prompts"
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

    const { stdout: formattedBranches } = await execPromise(
      'git branch --format "%(refname:short) %(upstream)"'
    )

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
      log.warn("👍 No local branches found that are not present upstream.")
      return
    }

    // For each prunable branch, get the diff info and last commit date.
    const options = await Promise.all(
      branchesToPrune.map(async ({ branch }) => {
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
          // Parse and reformat the date as "M/D/YY h:mm AM/PM"
          const rawDate = dateOutput.trim()
          const parsedDate = new Date(rawDate)
          // Format the date; this may produce "4/3/25, 4:38 PM" so we remove the comma.
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

    const deleteSpinner = spinner()
    deleteSpinner.start("Deleting local branches...")
    for (const branch of branchesToDelete) {
      log.step(`Deleting local branch: ${branch}`)
      await execPromise(`git branch -D ${branch}`)
    }
    deleteSpinner.stop("Local branches deleted.")
    outro("Selected branches have been deleted.")
  } catch (error) {
    log.error("Error during prune operation: " + error)
  }
}
