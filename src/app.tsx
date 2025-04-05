import React, { useState } from "react"
import { Text, useApp } from "ink"
import { Select } from "@inkjs/ui"
import chalk from "chalk"

export default function App() {
  const { exit } = useApp()
  const [selected, setSelected] = useState<string | null>(null)

  if (selected) {
    return (
      <Text>
        You selected: <Text color="green">{selected}</Text>
      </Text>
    )
  }

  return (
    <>
      <Text>Hello World</Text>
      <Text>Please choose an option:</Text>
      <Select
        options={[
          {
            label: `Option 1 ${chalk.gray("(a description)")}`,
            value: "option 1",
          },
          {
            label: "Option 2",
            value: "option 2",
          },
          {
            label: "Option 3",
            value: "Option 3",
          },
        ]}
        onChange={(newValue) => {
          setSelected(newValue)
          setTimeout(() => {
            exit()
          }, 1000)
        }}
      />
    </>
  )
}
