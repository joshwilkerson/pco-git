import React, { useState } from "react"
import { Text } from "ink"
import { Select } from "@inkjs/ui"
import chalk from "chalk"
import PruneBranches from "./prune_branches.js"
import OpenPRs from "./open_prs.js"
import Dependabot from "./dependabot.js"

export default function App() {
  const [view, setView] = useState<
    "menu" | "prune" | "open_prs" | "dependabot"
  >("menu")

  if (view === "menu") {
    return (
      <>
        <Text>Hello World</Text>
        <Text>Please choose an option:</Text>
        <Select
          options={[
            {
              label: `Prune branches ${chalk.gray(
                "(remove local branches that don't exist upstream or were never pushed)"
              )}`,
              value: "prune",
            },
            {
              label: `View open PRs ${chalk.gray(
                "(select a PR to open in your browser)"
              )}`,
              value: "open_prs",
            },
            {
              label: `Dependabot PRs ${chalk.gray("(merge branchs w/ open PRs to staging)")}`,
              value: "dependabot",
            },
          ]}
          onChange={(newValue) => {
            if (newValue === "prune") {
              setView("prune")
            } else if (newValue === "open_ps" || newValue === "open_prs") {
              setView("open_prs")
            } else if (newValue === "dependabot") {
              setView("dependabot")
            } else {
              process.exit(0)
            }
          }}
        />
      </>
    )
  }

  if (view === "prune") {
    return <PruneBranches onCancel={() => setView("menu")} />
  }

  if (view === "open_prs") {
    return <OpenPRs onCancel={() => setView("menu")} />
  }

  if (view === "dependabot") {
    return <Dependabot onCancel={() => setView("menu")} />
  }

  return null
}
