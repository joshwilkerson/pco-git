#!/usr/bin/env node
import { intro, outro, select, log } from "@clack/prompts"
import color from "picocolors"
import { intros, outros } from "./salutations.js"
import { pruneBranches } from "./prune_branches.js"

async function main() {
  const randomIntro = Math.floor(Math.random() * intros.length)
  const randomOutro = Math.floor(Math.random() * outros.length)

  intro(intros[randomIntro])

  const option = await select({
    message: "Please choose an option:",
    options: [
      {
        label: `Prune branches ${color.gray(
          "(Removes local branches not present on remote)"
        )}`,
        value: "prune",
      },
      { label: "Option 2", value: "2" },
    ],
  })

  if (option === "prune") {
    await pruneBranches()
  } else if (option === "2") {
    log.info("You chose Option 2.")
  } else {
    log.warn("No valid option selected.")
  }

  outro(outros[randomOutro])
}

main()
