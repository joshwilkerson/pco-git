import React, { useState, useEffect } from "react"
import { Text, Box, useApp, useInput } from "ink"
import { Select, Spinner } from "@inkjs/ui"
import { exec } from "child_process"
import { promisify } from "util"

const execPromise = promisify(exec)

type PR = {
  number: number
  title: string
  url: string
}

export default function OpenPRs({ onCancel }: { onCancel: () => void }) {
  const { exit } = useApp()
  const [phase, setPhase] = useState<
    "loading" | "selection" | "error" | "done"
  >("loading")
  const [prs, setPRs] = useState<PR[]>([])

  useInput((_, key) => {
    if (key.escape) {
      onCancel()
    }
  })

  useEffect(() => {
    async function fetchPRs() {
      try {
        const { stdout } = await execPromise(
          "gh pr list --json number,title,url"
        )
        const prList: PR[] = JSON.parse(stdout)
        if (!prList.length) {
          setPhase("error")
        } else {
          setPRs(prList)
          setPhase("selection")
        }
      } catch (error) {
        console.error("Error fetching PRs:", error)
        setPhase("error")
      }
    }
    if (phase === "loading") {
      fetchPRs()
    }
  }, [phase])

  if (phase === "loading") {
    return (
      <Box>
        <Spinner type="dots" />
        <Text> Loading open PRs...</Text>
      </Box>
    )
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">Error fetching open PRs or no PRs found.</Text>
        <Text dimColor>Press Esc to go back.</Text>
      </Box>
    )
  }

  if (phase === "selection") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>Select an open PR to open in your browser:</Text>
        <Select
          options={prs.map((pr) => ({
            label: `#${pr.number} - ${pr.title}`,
            value: pr.url,
          }))}
          onChange={(value: string) => {
            // Opens the PR URL in your default browser (macOS)
            exec(`open "${value}"`)
            setPhase("done")
            setTimeout(() => exit(), 1000)
          }}
        />
        <Text dimColor>Press Esc to cancel and go back.</Text>
      </Box>
    )
  }

  if (phase === "done") {
    return (
      <Box>
        <Text>Opening PR in browser...</Text>
      </Box>
    )
  }

  return null
}
