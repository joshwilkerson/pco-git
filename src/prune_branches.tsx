import React, { useState, useEffect } from "react"
import { Text, Box, useApp, useInput } from "ink"
import { MultiSelect, Select, Spinner } from "@inkjs/ui"
import { execSync, exec } from "child_process"
import { promisify } from "util"
import chalk from "chalk"

const execPromise = promisify(exec)

type Option = {
  label: string
  value: string
}

type PruneBranchesPhase =
  | "loading"
  | "selection"
  | "confirm"
  | "removing"
  | "done"

function formatCommitDate(commitDateString: string): string {
  const date = new Date(commitDateString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear().toString().slice(-2)
  let hours = date.getHours()
  const minutes = date.getMinutes()
  hours = hours % 12
  if (hours === 0) hours = 12
  const minuteStr = minutes < 10 ? "0" + minutes : minutes.toString()
  return `${month}/${day}/${year} ${hours}:${minuteStr}`
}

async function fetchOrphanedBranches(): Promise<Option[]> {
  await execPromise("git fetch --prune")

  const { stdout: localBranchesOutput } = await execPromise(
    'git branch --format="%(refname:short)"'
  )
  const localBranches = localBranchesOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .sort()

  const { stdout: remoteBranchesOutput } = await execPromise(
    'git branch -r --format="%(refname:short)"'
  )
  const remoteBranches = remoteBranchesOutput
    .split("\n")
    .map((line) => line.trim().replace(/^origin\//, ""))
    .filter((line) => line !== "")
    .sort()

  // Identify orphaned branches via direct comparison
  const orphanedBranchesFromComm = localBranches.filter(
    (branch) => !remoteBranches.includes(branch)
  )

  // Check branches marked [gone] in verbose output
  const { stdout: verboseBranchesOutput } = await execPromise("git branch -vv")
  const orphanedBranchesFromGone = verboseBranchesOutput
    .split("\n")
    .map((line) => {
      if (line.includes("[gone]")) {
        const parts = line.trim().split(/\s+/)
        return parts[0] === "*" ? parts[1] : parts[0]
      }
      return null
    })
    .filter(Boolean) as string[]

  const combined = Array.from(
    new Set([...orphanedBranchesFromComm, ...orphanedBranchesFromGone])
  )

  if (!combined.length) {
    return []
  }

  const { stdout: originHeadOutput } = await execPromise(
    "git rev-parse --abbrev-ref origin/HEAD"
  )
  const defaultBranch = originHeadOutput.trim().replace(/^origin\//, "")

  const options: Option[] = []
  for (const branch of combined) {
    try {
      const { stdout: lastCommitDateOutput } = await execPromise(
        `git log -1 --format=%cd ${branch}`
      )
      const commitDateRaw = lastCommitDateOutput.trim()
      const commitDateFormatted = formatCommitDate(commitDateRaw)

      const { stdout: aheadBehindOutput } = await execPromise(
        `git rev-list --left-right --count ${branch}...${defaultBranch}`
      )
      const [ahead, behind] = aheadBehindOutput.trim().split(/\s+/)

      options.push({
        label: `${branch} ${chalk.gray(
          `(last commit: ${commitDateFormatted} | diff: ${chalk.green(
            "↑" + ahead
          )} ${chalk.red("↓" + behind)})`
        )}`,
        value: branch,
      })
    } catch {
      options.push({ label: branch, value: branch })
    }
  }

  return options
}

export default function PruneBranches({ onCancel }: { onCancel: () => void }) {
  const { exit } = useApp()

  const [phase, setPhase] = useState<PruneBranchesPhase>("loading")
  const [orphanedBranches, setOrphanedBranches] = useState<Option[]>([])
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [deletedBranches, setDeletedBranches] = useState<string[]>([])

  useInput((_, key) => {
    if (phase === "selection" && key.escape) {
      onCancel()
    }
  })

  useEffect(() => {
    async function processPhase(): Promise<void> {
      if (phase === "loading") {
        await loadOrphanedBranches()
        return
      } else if (phase === "removing") {
        removeBranches(selectedBranches)
        return
      } else if (phase === "done") {
        setTimeout(() => exit(), 1000)
        return
      }
      return
    }

    processPhase().catch((err) => {
      console.error("Error:", err)
      setTimeout(() => exit(), 1000)
    })
  }, [phase])

  async function loadOrphanedBranches() {
    try {
      const branches = await fetchOrphanedBranches()
      if (!branches.length) {
        console.warn(
          "👍 No local branches found that are not present upstream."
        )
        setTimeout(() => exit(), 1000)
      } else {
        setOrphanedBranches(branches)
        setPhase("selection")
      }
    } catch (error) {
      console.error("Error fetching orphaned branches:", error)
      setTimeout(() => exit(), 1000)
    }
  }

  function removeBranches(branches: string[]) {
    const deleted: string[] = []
    for (const branch of branches) {
      execSync(`git branch -D ${branch}`, { stdio: "ignore" })
      deleted.push(branch)
    }
    setTimeout(() => {
      setDeletedBranches(deleted)
      setPhase("done")
    }, 1000)
  }

  if (phase === "loading") {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Fetching git branches...</Text>
      </Box>
    )
  }

  if (phase === "selection") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          Orphaned branches (local branches not present upstream or never
          pushed):
        </Text>
        <MultiSelect
          options={orphanedBranches}
          onChange={setSelectedBranches}
          onSubmit={(selected: string[]) => {
            if (selected.length === 0) return
            setSelectedBranches(selected)
            setPhase("confirm")
          }}
        />
        {selectedBranches.length > 0 && (
          <Text>
            🗑️{"  "}Branches to delete: {selectedBranches.join(", ")}
          </Text>
        )}
        <Text dimColor>Press Esc to cancel and go back.</Text>
      </Box>
    )
  }

  if (phase === "confirm") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          ⚠️{"  "}Local {selectedBranches.length > 1 ? "branches" : "branch"}{" "}
          will be removed:
          {"\n"}
          {selectedBranches.join("\n")}
          {"\n\n"}Continue?
        </Text>
        <Select
          options={[
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ]}
          onChange={(value: string) => {
            if (value === "yes") {
              setPhase("removing")
            } else {
              setPhase("selection")
            }
          }}
        />
      </Box>
    )
  }

  if (phase === "removing") {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Removing local branches...</Text>
      </Box>
    )
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Deleted branches:</Text>
        {deletedBranches.map((branch) => (
          <Text key={branch}>- {branch}</Text>
        ))}
        <Text>Exiting...</Text>
      </Box>
    )
  }

  return null
}
