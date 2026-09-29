import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

test("Crossing diagnostics distinguish spatial separation from disconnected intersections", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  // Both imports have the same counts, so each waits for its own model hash.
  let previousHash = null;
  for (const [offset, expected] of [
    [1, "0"],
    [0, "1"],
  ]) {
    const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
    p.nodes.push(
      { id: "n3", position: [1.5, offset, -1] },
      { id: "n4", position: [1.5, offset, 1] },
    );
    p.members.push({ ...p.members[0], id: "m2", start: "n3", end: "n4" });
    await page.locator("#import-file").setInputFiles({
      name: "spatial-crossing.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await expect(page.locator("#model-count")).toHaveText(
      "4 nodes · 2 members",
    );
    if (previousHash)
      await expect(page.locator("#hash-status")).not.toHaveText(previousHash);
    if (
      (await page.locator("#model-crossings").getAttribute("aria-pressed")) !==
      "true"
    ) {
      if ((await page.locator("#view-options").getAttribute("open")) === null)
        await page.locator("#view-options > summary").click();
      await page.locator("#model-crossings").click();
    }
    const hash = await page.locator("#hash-status").textContent();
    previousHash = hash;
    for (const view of ["elevation", "plan", "3d"]) {
      await page.locator(`#view-${view}`).click();
      await expect(page.locator("#viewport")).toHaveAttribute(
        "data-disconnected-crossings",
        expected,
      );
      await expect(page.locator("#model-crossings")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator("#geometry-status")).toHaveText(
        expected === "1" ? /1 unconnected crossings/ : "",
      );
      await expect(page.locator("#hash-status")).toHaveText(hash);
    }
  }
  await page.locator("#home").click();
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  if ((await page.locator("#view-options").getAttribute("open")) === null)
    await page.locator("#view-options > summary").click();
  await page.locator("#model-crossings").click();
  await expect(page.locator("#model-crossings")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const view of ["elevation", "plan", "3d"]) {
    await page.locator(`#view-${view}`).click();
    await expect(page.locator("#viewport")).toHaveAttribute(
      "data-disconnected-crossings",
      "0",
    );
  }
  expect(errors).toEqual([]);
  await mkdir(evidenceDir(), { recursive: true });
  await page.screenshot({ path: `${evidenceDir()}/reference-crossings.png` });
});
