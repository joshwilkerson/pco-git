#!/usr/bin/env node
import { intro, outro, select } from "@clack/prompts"

async function main() {
  intro("Welcome to pco-git CLI")

  const option = await select({
    message: "Please choose an option:",
    options: [
      { label: "Option 1", value: "1" },
      { label: "Option 2", value: "2" },
    ],
  })

  if (option === "1") {
    console.log("You chose Option 1.")
  } else if (option === "2") {
    console.log("You chose Option 2.")
  } else {
    console.log("No valid option selected.")
  }

  outro("Exiting pco-git CLI")
}

main()
