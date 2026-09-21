import { evidenceDir } from "../../tools/evidence.mjs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const folder = evidenceDir("evidence/M01/topology");
async function exported(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#export-project").click();
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}
async function importProject(page, p) {
  await page.locator("#import-file").setInputFiles({
    name: "topology.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#workspace")).toBeVisible();
}
async function preview(page) {
  await page
    .getByRole("button", { name: "Preview topology", exact: true })
    .click();
  await expect(page.locator("#topology-commit")).toBeVisible();
}
async function commit(page) {
  await page.locator("#topology-commit").click();
  await expect(page.locator("#modal")).not.toBeVisible();
}
test("M01 topology: axes, loaded split preview, undo, redo, oracle, save and reopen", async ({
  page,
}) => {
  await mkdir(folder, { recursive: true });
  await page.goto("/");
  const original = JSON.parse(
    await readFile("fixtures/models/B07.json", "utf8"),
  );
  await importProject(page, original);
  const initial = await exported(page),
    hash = await page.locator("#hash-status").textContent();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#axes-toggle").click();
  await expect(page.locator(".axis-summary")).toContainText("m1 local axes");
  await page.screenshot({ path: `${folder}/axes.png`, fullPage: true });
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#topology").click();
  await page.locator("#split-stations").fill("0.25, 0.75");
  await preview(page);
  await expect(page.locator("#topology-preview")).toContainText(
    "members · 1 → 3",
  );
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#split-stations").fill("0");
  await expect(page.locator("#topology-commit")).toBeHidden();
  await page
    .getByRole("button", { name: "Preview topology", exact: true })
    .click();
  await expect(page.locator("#topology-error")).toContainText("INVALID_SCHEMA");
  await page.locator("#split-stations").fill("0.25, 0.75");
  await preview(page);
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({
    path: `${folder}/split-preview.png`,
    fullPage: true,
  });
  await commit(page);
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await expect(page.locator("#result-status")).toContainText("Stale");
  const split = await exported(page);
  expect(split.loads).toHaveLength(3);
  expect(split.members.map((x) => x.parentMemberId)).toEqual([
    "m1",
    "m1",
    "m1",
  ]);
  await page.locator("#undo").click();
  const undo = await exported(page);
  for (const key of ["nodes", "members", "loads", "supports"])
    expect(undo[key]).toEqual(initial[key]);
  await page.locator("#redo").click();
  const redo = await exported(page);
  for (const key of ["nodes", "members", "loads", "supports"])
    expect(redo[key]).toEqual(split[key]);
  await writeFile(
    `${folder}/split-project.json`,
    JSON.stringify(split, null, 2),
  );
  const oracle = JSON.parse(
    execFileSync(
      "tools/oracle-env/bin/python",
      ["tools/oracle.py", `${folder}/split-project.json`],
      { encoding: "utf8" },
    ),
  );
  await writeFile(
    `${folder}/split-opensees.json`,
    JSON.stringify(oracle, null, 2),
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const rows = page.locator("#results-content tbody tr");
  for (const [i, n] of split.nodes.entries()) {
    const cells = await rows.nth(i).locator("td").allTextContents();
    for (let j = 0; j < 6; j++)
      expect(
        Math.abs(Number(cells[j]) - oracle.nodes[n.id][j] * (j < 3 ? 1000 : 1)),
      ).toBeLessThan(0.00000051);
  }
  const download = page.waitForEvent("download");
  await page.locator("#export-report").click();
  await writeFile(
    `${folder}/split-report.html`,
    await readFile(await (await download).path()),
  );
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
  await page.reload();
  await page.getByRole("button", { name: /B07.*4 nodes/ }).click();
  const reopened = await exported(page);
  expect(reopened.members).toEqual(split.members);
  expect(reopened.loads).toEqual(split.loads);
  // A portable JSON import must also accept optional member provenance.
  await importProject(page, split);
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
});
test("M01 topology: crossing stays disconnected, connect and merge are previewed and atomic", async ({
  page,
}) => {
  await page.goto("/");
  const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  p.analysisMode = "planarXZ";
  p.nodes.push(
    { id: "n3", position: [1.5, 0, -1] },
    { id: "n4", position: [1.5, 0, 1] },
    { id: "near", position: [0, 0, 0] },
  );
  p.members.push({ ...p.members[0], id: "m2", start: "n3", end: "n4" });
  await importProject(page, p);
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 2 members");
  const original = await exported(page);
  await page.locator("#topology").click();
  await page.locator("#topology-kind").selectOption("ConnectIntersections");
  await preview(page);
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 2 members");
  await page.locator("#close-modal").click();
  expect((await exported(page)).members).toEqual(original.members);
  await page.locator("#topology").click();
  await page.locator("#topology-kind").selectOption("ConnectIntersections");
  await preview(page);
  await commit(page);
  await expect(page.locator("#model-count")).toHaveText("6 nodes · 4 members");
  const connected = await exported(page);
  const joint = connected.nodes.find(
    (n) => n.position[0] === 1.5 && n.position[2] === 0,
  );
  expect(
    connected.members.filter((m) => m.start === joint.id || m.end === joint.id),
  ).toHaveLength(4);
  await page.locator("#undo").click();
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 2 members");
  await page.locator("#topology").click();
  await page.locator("#topology-kind").selectOption("MergeNodes");
  await page.locator("#merge-target").selectOption("n1");
  await page.locator("#merge-sources").fill("n2");
  await page
    .getByRole("button", { name: "Preview topology", exact: true })
    .click();
  await expect(page.locator("#topology-error")).toContainText("INVALID_SCHEMA");
  await expect(page.locator("#topology-commit")).toBeHidden();
  await page.locator("#merge-sources").fill("near");
  await preview(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${folder}/merge-mobile.png`, fullPage: true });
  await commit(page);
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 2 members");
  await page.locator("#undo").click();
  expect((await exported(page)).nodes).toEqual(original.nodes);
  await writeFile(
    `${folder}/connected-project.json`,
    JSON.stringify(connected, null, 2),
  );
});
