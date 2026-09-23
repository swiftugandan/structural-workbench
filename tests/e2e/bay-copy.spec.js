import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/bay-copy";
process.env.WORKBENCH_TASK_ID ||= "M03-A";
process.env.WORKBENCH_MILESTONE ||= "M03";

const evidence = () => evidenceDir("evidence/M03/bay-copy");

function tdNumbers(row) {
  return row
    .locator("td")
    .allTextContents()
    .then((cells) => cells.map((c) => Number(String(c).replaceAll(",", ""))));
}

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
  await expect(page.locator("#bay-preview")).toContainText("Nodes · 4 → 8");
  await page.locator("#bay-commit").click();

  await expect(page.locator("#model-count")).toHaveText("8 nodes · 8 members");
  await expect(page.locator("#analysis-mode")).toHaveValue("spatial");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");

  // CopyBay does not copy loads — apply spatial nodal actions on a roof joint.
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const spatial = JSON.parse(await readFile(await (await pending).path(), "utf8"));
  const roof = spatial.nodes.reduce((a, b) =>
    b.position[2] > a.position[2] ||
    (b.position[2] === a.position[2] && b.position[1] >= a.position[1])
      ? b
      : a,
  );
  spatial.loads = [
    {
      id: "l1",
      case: spatial.loadCases[0].id,
      type: "nodal",
      node: roof.id,
      values: [10000, 5000, -8000, 0, 0, 0],
    },
  ];
  await page.locator("#import-file").setInputFiles({
    name: "spatial-bay.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(spatial)),
  });
  await expect(page.locator("#model-count")).toHaveText("8 nodes · 8 members");

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

  await page.locator('[data-tab="forces"]').click();
  await expect(
    page.getByRole("columnheader", { name: "My [kN m]", exact: true }),
  ).toBeVisible();
  const rows = page.locator("#results-content table tbody tr");
  const n = await rows.count();
  let maxMy = 0,
    maxMz = 0,
    maxT = 0;
  for (let i = 0; i < n; i++) {
    const cells = await tdNumbers(rows.nth(i));
    // td: End, Fx, Fy, Fz, Mx, My, Mz
    maxT = Math.max(maxT, Math.abs(cells[4] || 0));
    maxMy = Math.max(maxMy, Math.abs(cells[5] || 0));
    maxMz = Math.max(maxMz, Math.abs(cells[6] || 0));
  }
  // Spatial Fx/Fy/Fz on the roof must excite both bending axes and torsion.
  expect(maxMy).toBeGreaterThan(1);
  expect(maxMz).toBeGreaterThan(1);
  expect(maxT).toBeGreaterThan(0.05);

  const beforeHash = await page.locator("#hash-status").textContent();
  const downloadPromise = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.analysisMode).toBe("spatial");
  expect(exported.nodes).toHaveLength(8);
  expect(exported.members).toHaveLength(8);
  expect(exported.supports).toHaveLength(4);
  expect(exported.loads[0].values).toEqual([10000, 5000, -8000, 0, 0, 0]);
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
    peakEndActions_kNm: { My: maxMy, Mz: maxMz, T: maxT },
    artifacts: ["bay-copy-project.json"],
  });
});
