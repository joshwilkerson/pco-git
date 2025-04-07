import React, { useState } from "react"
import { Text } from "ink"
import { Select } from "@inkjs/ui"
import chalk from "chalk"
import PruneBranches from "./prune_branches.js"

export default function App() {
  const [view, setView] = useState<"menu" | "prune">("menu")

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
              label: "Option 2 (Not implemented)",
              value: "option2",
            },
            {
              label: "Option 3 (Not implemented)",
              value: "option3",
            },
          ]}
          onChange={(newValue) => {
            if (newValue === "prune") {
              setView("prune")
            } else {
              // For unimplemented options, exit immediately.
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

  return null
}
