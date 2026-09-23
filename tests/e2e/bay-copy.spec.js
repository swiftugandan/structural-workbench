import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/bay-copy";
process.env.WORKBENCH_TASK_ID ||= "M03-A";
process.env.WORKBENCH_MILESTONE ||= "M03";

const evidence = () => evidenceDir("evidence/M03/bay-copy");

test("M03 copy portal into bays, analyse and inspect My Mz torsion", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#new-portal").click();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");

  await page.locator("#copy-bay").click();
  await page.locator('#bay-form [name="spacing"]').fill("6");
  await page.locator('#bay-form [name="count"]').fill("1");
  await page.locator('#bay-form [name="axis"]').selectOption("Y");
  await page
    .getByRole("button", { name: "Preview bay copy", exact: true })
    .click();
  await expect(page.locator("#bay-preview")).toContainText("spatial");
  await expect(page.locator("#bay-preview")).toContainText(
    "Nodes · 4 → 8",
  );
  await page.locator("#bay-commit").click();

  await expect(page.locator("#model-count")).toHaveText("8 nodes · 8 members");
  await expect(page.locator("#analysis-mode")).toHaveValue("spatial");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  for (const [value, name] of [
    ["moment", "My"],
    ["momentZ", "Mz"],
    ["torsion", "T"],
  ]) {
    await page.locator("#result-family").selectOption("moments");
    await page.locator("#display-result").selectOption(value);
    await expect(page.locator("#action-legend")).toHaveAttribute(
      "data-component",
      name,
    );
    await expect(
      page.locator(`[data-result-component="${name}"]`).first(),
    ).toBeVisible();
  }

  const beforeHash = await page.locator("#hash-status").textContent();
  const downloadPromise = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.analysisMode).toBe("spatial");
  expect(exported.nodes).toHaveLength(8);
  expect(exported.members).toHaveLength(8);
  expect(exported.supports).toHaveLength(4);
  for (const s of exported.supports) {
    expect(s.fixed).toEqual([true, true, true, true, true, true]);
  }

  await mkdir(evidence(), { recursive: true });
  await writeFile(
    `${evidence()}/bay-copy-project.json`,
    JSON.stringify(exported),
  );

  await page.locator("#home").click();
  await page.locator("#import-file").setInputFiles({
    name: "bay-copy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator("#model-count")).toHaveText("8 nodes · 8 members");
  await expect(page.locator("#analysis-mode")).toHaveValue("spatial");
  await expect(page.locator("#hash-status")).toHaveText(beforeHash);

  expect(errors).toEqual([]);
  await record("bay-copy-browser", {
    test: "M03 copy portal into bays, analyse and inspect My Mz torsion",
    nodes: exported.nodes.length,
    members: exported.members.length,
    supports: exported.supports.length,
    analysisMode: exported.analysisMode,
    artifacts: ["bay-copy-project.json"],
  });
});
