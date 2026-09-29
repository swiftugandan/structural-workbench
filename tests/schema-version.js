import { readFileSync } from "node:fs";

/** The project schema version the application writes, from the contract. */
export const CURRENT_SCHEMA = JSON.parse(
  readFileSync(new URL("../contracts/project.schema.json", import.meta.url)),
).properties.schemaVersion.const;

/** "a → current" as written in the migration banner, for toContainText. */
export const migratedTo = (from) =>
  new RegExp(
    `${from.replaceAll(".", "\\.")} → ${CURRENT_SCHEMA.replaceAll(".", "\\.")}`,
    "i",
  );
