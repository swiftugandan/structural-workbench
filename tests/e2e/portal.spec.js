import { evidenceDir } from "../../tools/evidence.mjs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
async function create(page) {
  await page.goto("/");
  await page.locator("#new-portal").click();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
}
async function exported(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#export-project").click();
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}
test("M01 portal: setup, sway, edit coordinates, undo, draw, reject, save and reopen", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  const initial = await exported(page),
    hash = await page.locator("#hash-status").textContent();
  expect(initial.analysisMode).toBe("planarXZ");
  expect(initial.loads[0].values[0]).toBe(10000);
  await mkdir(evidenceDir("evidence/M01/current"), { recursive: true });
  await writeFile(
    `${evidenceDir("evidence/M01/current")}/portal-unbraced.json`,
    JSON.stringify(initial, null, 2),
  );
  const oracle = JSON.parse(
    execFileSync(
      "tools/oracle-env/bin/python",
      [
        "tools/oracle.py",
        `${evidenceDir("evidence/M01/current")}/portal-unbraced.json`,
      ],
      { encoding: "utf8" },
    ),
  );
  await writeFile(
    `${evidenceDir("evidence/M01/current")}/portal-opensees.json`,
    JSON.stringify(oracle, null, 2),
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const rows = page.locator("#results-content tbody tr");
  for (const [i, n] of initial.nodes.entries()) {
    const cells = await rows.nth(i).locator("td").allTextContents();
    for (let j = 0; j < 6; j++)
      expect(
        Math.abs(Number(cells[j]) - oracle.nodes[n.id][j] * (j < 3 ? 1000 : 1)),
      ).toBeLessThan(0.00000051);
  }
  expect(
    Number(await rows.nth(2).locator("td").first().textContent()),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Nodes 4/ }).click();
  await page.getByRole("button", { name: "Edit n3", exact: true }).click();
  await page.getByLabel("X (m or mm)", { exact: true }).fill("4500 mm");
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
  await page.locator("#close-modal").click();
  await expect(page.locator("#result-status")).toContainText("Stale");
  await page.locator("#undo").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#draw-toggle").click();
  for (const [label, value] of [
    ["Start X", "0"],
    ["Start Z", "0"],
    ["End X", "4000 mm"],
    ["End Z", "3000 mm"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  const braced = await exported(page);
  expect(
    braced.members.find((x) => !["m1", "m2", "m3"].includes(x.id)),
  ).toMatchObject({ start: "n1", end: "n3" });
  for (const [label, value] of [
    ["End X", "0"],
    ["End Z", "0"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(page.locator("#draw-status")).toContainText(
    "ZERO_LENGTH_MEMBER",
  );
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  await page
    .getByRole("button", { name: "Cancel drawing", exact: true })
    .click();
  await page.locator("#undo").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#redo").click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#display-result").selectOption("deformed");
  await mkdir(evidenceDir("evidence/M01/current"), { recursive: true });
  await writeFile(
    `${evidenceDir("evidence/M01/current")}/portal-project.json`,
    JSON.stringify(braced, null, 2),
  );
  await page.screenshot({
    path: `${evidenceDir("evidence/M01/current")}/portal.png`,
    fullPage: true,
  });
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
  await page.reload();
  await page.getByRole("button", { name: /Planar portal.*4 nodes/ }).click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  const saved = await exported(page);
  expect(saved.nodes).toEqual(braced.nodes);
  expect(saved.members).toEqual(braced.members);
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const reportDownload = page.waitForEvent("download");
  await page.locator("#export-report").click();
  await writeFile(
    `${evidenceDir("evidence/M01/current")}/portal-report.html`,
    await readFile(await (await reportDownload).path()),
  );
  for (const id of ["s1", "s2"]) {
    await page.getByRole("button", { name: /Supports [12]/ }).click();
    await page.getByRole("button", { name: "Edit " + id, exact: true }).click();
    await page
      .getByRole("button", { name: "Delete entity", exact: true })
      .click();
    await page.locator("#close-modal").click();
  }
  await page.locator("#analyse").click();
  await expect(page.locator("#message")).toContainText("UNSTABLE_MODEL");
  await expect(page.locator("#export-report")).toBeDisabled();
  await page.locator("#undo").click();
  await page.locator("#undo").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  expect(errors).toEqual([]);
});
test("M01 drawing Escape does not mutate and compact controls do not overflow", async ({
  page,
}) => {
  await create(page);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#draw-toggle").click();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.getByLabel("End X", { exact: true }).fill("8 m");
  await page.keyboard.press("Escape");
  await expect(page.locator("#drawing-panel")).toBeHidden();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#draw-toggle").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidenceDir("evidence/M01/current")}/portal-mobile.png`,
    fullPage: true,
  });
});
