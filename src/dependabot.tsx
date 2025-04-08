import React, { useState, useEffect } from "react"
import { Text, Box, useApp, useInput } from "ink"
import { Select, Spinner } from "@inkjs/ui"
import { exec } from "child_process"
import { promisify } from "util"

const execPromise = promisify(exec)

type PR = {
  number: number
  title: string
  headRefName: string
}

type DependabotPhase =
  | "init"
  | "setup"
  | "loading"
  | "confirm" // asking for merge of a specific PR
  | "merging"
  | "conflict" // waiting for manual resolution
  | "push-confirmation"
  | "done"
  | "error"

export default function Dependabot({ onCancel }: { onCancel: () => void }) {
  const { exit } = useApp()
  const [phase, setPhase] = useState<DependabotPhase>("init")
  const [prs, setPRs] = useState<PR[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [log, setLog] = useState<string>("")

  useInput((_, key) => {
    if (key.escape) {
      onCancel()
    }
    // In "conflict" phase, wait for Enter key to continue after manual resolution
    if (phase === "conflict" && key.return) {
      // Attempt to continue merge
      continueMerge()
    }
  })

  async function continueMerge() {
    const pr = prs[currentIndex]!
    try {
      setLog(`Attempting to continue merge for ${pr.headRefName}...`)
      await execPromise(`git merge --continue`)
      setLog(`✅ Resolved merge for ${pr.headRefName}.`)
      if (currentIndex + 1 < prs.length) {
        setCurrentIndex(currentIndex + 1)
        setPhase("confirm")
      } else {
        setPhase("push-confirmation")
      }
    } catch (error) {
      setLog(
        `Merge continuation failed for ${pr.headRefName}. Make sure conflicts are resolved then press Enter again.`
      )
    }
  }

  useEffect(() => {
    async function runSetup() {
      try {
        // Stash any changes, checkout staging and pull latest.
        setLog("🔁 Checking out staging branch...")
        await execPromise("git stash")
        await execPromise("git checkout staging")
        await execPromise("git pull")

        setPhase("loading")
      } catch (error) {
        setLog("Error during setup: " + error)
        setPhase("error")
      }
    }

    async function loadPRs() {
      try {
        setLog("📡 Fetching open PRs from GitHub...")
        // Fetch PRs with base main and state open.
        const { stdout } = await execPromise(
          "gh pr list --base main --state open --json number,title,headRefName"
        )
        const allPRs: PR[] = JSON.parse(stdout)
        // Filter PRs: title contains (deps or deps-dev) OR headRefName starts with dependabot/
        const filtered = allPRs.filter((pr) => {
          const regex = /\(deps(-dev)?\)/i
          return (
            regex.test(pr.title) || pr.headRefName.startsWith("dependabot/")
          )
        })

        if (!filtered.length) {
          setLog("🚫 No matching dependabot PRs found.")
          setPhase("done")
        } else {
          setPRs(filtered)
          setPhase("confirm")
        }
      } catch (err) {
        setLog("Error fetching PRs: " + err)
        setPhase("error")
      }
    }

    // Phase machine
    if (phase === "init") {
      runSetup().then(() => setPhase("loading"))
    } else if (phase === "loading") {
      loadPRs()
    } else if (phase === "done") {
      setTimeout(() => exit(), 1500)
    }
  }, [phase, exit])

  // Merge the current PR and then move to the next
  async function mergeCurrentPR() {
    const pr = prs[currentIndex]!
    try {
      setLog(`📥 Fetching branch ${pr.headRefName}...`)
      await execPromise(`git fetch origin ${pr.headRefName}`)
      setLog(`🔀 Merging ${pr.headRefName} into staging...`)
      await execPromise(`git merge --no-ff --no-edit origin/${pr.headRefName}`)
      setLog(`✅ Merged ${pr.headRefName} into staging.`)
    } catch (error) {
      // Conflict detected; pause and allow manual resolution.
      setLog(
        `❌ Merge conflict with ${pr.headRefName}. Please resolve conflicts manually and then press Enter to continue.`
      )
      setPhase("conflict")
      return
    }
    // Move onto next PR if any remain, else go to push confirmation.
    if (currentIndex + 1 < prs.length) {
      setCurrentIndex(currentIndex + 1)
      setPhase("confirm")
    } else {
      setPhase("push-confirmation")
    }
  }

  // Render different phases
  if (phase === "init" || phase === "setup" || phase === "loading") {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> {log}</Text>
      </Box>
    )
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">{log}</Text>
        <Text dimColor>Press Esc to go back.</Text>
      </Box>
    )
  }

  if (phase === "confirm") {
    const pr = prs[currentIndex]!
    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          PR #{pr.number}: {pr.title} (branch: {pr.headRefName})
        </Text>
        <Text>Merge '{pr.headRefName}' into staging?</Text>
        <Select
          options={[
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ]}
          onChange={(value: string) => {
            if (value === "yes") {
              setPhase("merging")
              mergeCurrentPR()
            } else {
              // If skipped, move to next PR or to push confirmation if none.
              if (currentIndex + 1 < prs.length) {
                setCurrentIndex(currentIndex + 1)
                setPhase("confirm")
              } else {
                setPhase("push-confirmation")
              }
            }
          }}
        />
        <Text dimColor>Press Esc to cancel and go back.</Text>
      </Box>
    )
  }

  if (phase === "conflict") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">{log}</Text>
        <Text>
          Resolve the merge conflicts manually in another terminal, then press
          Enter to continue.
        </Text>
      </Box>
    )
  }

  if (phase === "push-confirmation") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>All done. Push staging to origin?</Text>
        <Select
          options={[
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ]}
          onChange={async (value: string) => {
            if (value === "yes") {
              setLog("🚀 Pushing staging...")
              try {
                await execPromise("git push origin staging")
                setLog("Staging pushed to origin.")
              } catch (error) {
                setLog("Error pushing staging: " + error)
              }
            } else {
              setLog("💾 Skipped push. Staging is updated locally.")
            }
            setPhase("done")
          }}
        />
      </Box>
    )
  }

  if (phase === "merging") {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Merging PRs...</Text>
      </Box>
    )
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column">
        <Text>{log}</Text>
        <Text>Exiting...</Text>
      </Box>
    )
  }

  return null
}
