#!/usr/bin/env node
/**
 * Hash acquired AISC steel resources and print a resources.lock.json fragment.
 *
 * Usage (after placing PDFs in resources/private/):
 *   node tools/acquire-steel-resources.mjs
 *
 * Expected filenames (rename after download if needed):
 *   aisc-360-22.pdf
 *   aisc-design-examples-v16.pdf
 *   aisc-manual-companion-v160-vol1-errata.pdf   (optional)
 *   aisc-shapes-database-v16.xlsx                (optional)
 *
 * Does not invent clauses. Does not enable the profile. After hashes look right,
 * merge the printed entries into resources.lock.json and remove ids from unresolved.
 */
import { createHash } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vault = path.join(root, "resources", "private");

const expected = [
  {
    id: "R-CODE-STEEL",
    file: "aisc-360-22.pdf",
    edition: "ANSI/AISC 360-22",
    origin: "https://www.aisc.org/aisc/publications/current-standards/aisc-360/",
    required: true,
  },
  {
    id: "R-STEEL-EXAMPLES",
    file: "aisc-design-examples-v16.pdf",
    edition: "Manual Companion Volume 1 Design Examples v16.0",
    origin:
      "https://www.aisc.org/aisc/publications/steel-construction-manual/manual-companion-for-16th-edition/",
    required: true,
  },
  {
    id: "R-STEEL-EXAMPLES-ERRATA",
    file: "aisc-manual-companion-v160-vol1-errata.pdf",
    edition: "Design Examples v16.0 errata 2025-06-02",
    origin: "https://www.aisc.org/media/12lltkmv/manual-companion-v160_vol-1-errata.pdf",
    required: false,
  },
  {
    id: "R-STEEL-SHAPES-V16",
    file: "aisc-shapes-database-v16.xlsx",
    edition: "AISC Shapes Database v16.0",
    origin: "https://www.aisc.org/aisc/publications/steel-construction-manual/",
    required: false,
  },
];

async function exists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

const retrievedAt = new Date().toISOString();
const acquired = [];
const missingRequired = [];

for (const item of expected) {
  const localPath = path.join(vault, item.file);
  if (!(await exists(localPath))) {
    if (item.required) missingRequired.push(item);
    console.error(`missing: ${item.file}`);
    continue;
  }
  const hash = await sha256File(localPath);
  acquired.push({
    id: item.id,
    edition: item.edition,
    authoritativeOrigin: item.origin,
    contentHashSha256: hash,
    rightsStatus:
      "Acquired for local implementation use from free AISC download; not redistributed in repository",
    localPath: `resources/private/${item.file}`,
    retrievedAt,
    validationUse: "M07 aisc-360-22-lrfd S2 clause dossier and fixtures",
  });
  console.error(`hashed: ${item.file} → ${hash}`);
}

if (missingRequired.length) {
  console.error("\nRequired files still missing. Download in a browser (aisc.org uses bot protection):");
  for (const item of missingRequired) {
    console.error(`  - ${item.file} from ${item.origin}`);
  }
  console.error(`Place them under ${vault}`);
  process.exitCode = 1;
}

console.log(JSON.stringify({ acquired }, null, 2));
