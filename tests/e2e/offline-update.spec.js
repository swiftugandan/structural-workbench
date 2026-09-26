import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Two static deployments of the actual built application and WASM. Only the
// deployment marker differs. No solver, result, storage or worker mocks.
test("A real waiting build installs, preserves the saved model, and reloads atomically", async ({
  page,
}) => {
  test.setTimeout(90000);
  const manifest = JSON.parse(await readFile("dist/build.json", "utf8"));
  const versions = [];
  for (const version of ["A", "B"]) {
    const sourceHash = createHash("sha256")
      .update(`update-fixture-${version}-${manifest.sourceHash}`)
      .digest("hex");
    const files = {};
    for (const file of Object.keys(manifest.files))
      files[file] = await readFile(`dist/${file}`);
    files["sw.js"] = Buffer.from(
      files["sw.js"].toString().replace(manifest.sourceHash, sourceHash),
    );
    files["app.js"] = Buffer.from(
      `window.deploymentMarker = '${version}';\n` + files["app.js"],
    );
    const hashes = Object.fromEntries(
      Object.entries(files).map(([file, bytes]) => [
        file,
        createHash("sha256").update(bytes).digest("hex"),
      ]),
    );
    const buildHash = createHash("sha256")
      .update(JSON.stringify(hashes))
      .digest("hex");
    files["build.json"] = Buffer.from(
      JSON.stringify({ sourceHash, buildHash, files: hashes }),
    );
    versions.push({ files, buildHash });
  }
  let current = 0;
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, "http://local").pathname;
    const file = pathname === "/" ? "app.html" : pathname.slice(1);
    const bytes = versions[current].files[file];
    if (!bytes) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".wasm")
          ? "application/wasm"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".json")
              ? "application/json"
              : "text/html",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => !!window.__workbenchOffline);
    await page.locator("#new-project").click();
    await expect(page.locator("#save-status")).toHaveText("Saved locally");
    await expect
      .poll(() => page.evaluate(() => window.deploymentMarker))
      .toBe("A");
    current = 1;
    await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration()).update(),
    );
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    // The active tab must still fetch assets only from A, even while B is cached.
    expect(
      await page.evaluate(() =>
        fetch("./app.js")
          .then((r) => r.text())
          .then((t) => t.includes("deploymentMarker = 'A'")),
      ),
    ).toBe(true);
    await page.locator("#span").fill("7");
    await page.locator("#member-form button.primary").click();
    await expect(page.locator("#update-banner")).toBeVisible();
    await page.locator("#reload-update").click();
    await page.waitForFunction(() => window.deploymentMarker === "B");
    await expect(page.locator("#build-status")).toHaveAttribute(
      "data-build-hash",
      versions[1].buildHash,
    );
    await page.locator("#recent-projects .recent-row").first().click();
    await expect(page.locator("#span")).toHaveValue("7");
    await page.locator("#analyse").click();
    await expect(page.locator("#result-status")).toHaveText("✓ Current");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
