/**
 * Headed browser acquisition of AISC steel resources into resources/private/.
 * Run: node tools/browser-acquire-steel.mjs
 */
import { chromium } from "@playwright/test";
import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vault = path.join(root, "resources", "private");

async function exists(p) {
  try {
    await access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function waitForCloudflare(page, label) {
  for (let i = 0; i < 40; i++) {
    const title = await page.title().catch(() => "");
    const body = await page.locator("body").innerText().catch(() => "");
    if (
      !/security verification|just a moment|performing security|checking your browser/i.test(
        title + "\n" + body,
      )
    ) {
      console.error(`[ok] passed bot check: ${label}`);
      return;
    }
    await page.waitForTimeout(1500);
  }
  throw new Error(`Cloudflare challenge did not clear for ${label}`);
}

async function downloadFromPage(page, url, destName, clickHints) {
  const dest = path.join(vault, destName);
  if (await exists(dest)) {
    console.error(`[skip] already present: ${destName}`);
    return dest;
  }
  console.error(`[nav] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForCloudflare(page, destName);

  // Prefer an explicit download control; fall back to first PDF-ish link.
  let clicked = false;
  for (const hint of clickHints) {
    const loc = page.getByRole("link", { name: hint }).or(page.getByRole("button", { name: hint }));
    if (await loc.first().isVisible().catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 180000 }),
        loc.first().click(),
      ]);
      await download.saveAs(dest);
      console.error(`[saved] ${destName} ← ${download.suggestedFilename()}`);
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    const pdfLink = page.locator('a[href*=".pdf"], a[href*="download"], a[href*="Download"]').first();
    if (await pdfLink.isVisible().catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 180000 }),
        pdfLink.click(),
      ]);
      await download.saveAs(dest);
      console.error(`[saved] ${destName} ← ${download.suggestedFilename()}`);
      clicked = true;
    }
  }
  if (!clicked) {
    // Dump useful anchors for debugging
    const anchors = await page.evaluate(() =>
      [...document.querySelectorAll("a")]
        .slice(0, 40)
        .map((a) => ({ text: (a.textContent || "").trim().slice(0, 80), href: a.href })),
    );
    console.error("[debug] anchors:", JSON.stringify(anchors, null, 2));
    throw new Error(`No download control found for ${destName}`);
  }
  return dest;
}

await mkdir(vault, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  await downloadFromPage(
    page,
    "https://www.aisc.org/publications/steel-standards/aisc-360",
    "aisc-360-22.pdf",
    [/Download/i, /Specification for Structural Steel Buildings/i, /ANSI\/AISC 360-22/i, /PDF/i],
  );

  await downloadFromPage(
    page,
    "https://www.aisc.org/aisc/publications/steel-construction-manual/manual-companion-for-16th-edition/",
    "aisc-design-examples-v16.pdf",
    [/Volume 1/i, /Design Examples/i, /Download/i, /Companion/i, /PDF/i],
  );

  // Errata is a direct media URL — try page navigation with download.
  const errataDest = path.join(vault, "aisc-manual-companion-v160-vol1-errata.pdf");
  if (!(await exists(errataDest))) {
    console.error("[nav] errata PDF");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
      page.goto(
        "https://www.aisc.org/media/12lltkmv/manual-companion-v160_vol-1-errata.pdf",
        { waitUntil: "domcontentloaded", timeout: 120000 },
      ),
    ]);
    if (download) {
      await download.saveAs(errataDest);
      console.error(`[saved] errata ← ${download.suggestedFilename()}`);
    } else {
      // Sometimes PDFs open inline; fetch bytes via page request after CF cookie.
      const res = await page.request.get(
        "https://www.aisc.org/media/12lltkmv/manual-companion-v160_vol-1-errata.pdf",
      );
      if (res.ok()) {
        const buf = await res.body();
        await import("node:fs/promises").then((fs) =>
          fs.writeFile(errataDest, buf),
        );
        console.error(`[saved] errata via authenticated request (${buf.length} bytes)`);
      } else {
        console.error(`[warn] errata status ${res.status()}`);
      }
    }
  } else {
    console.error("[skip] errata already present");
  }
} finally {
  await browser.close();
}

// Hash into lock fragment
await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [path.join(root, "tools/acquire-steel-resources.mjs")],
    { cwd: root, stdio: "inherit" },
  );
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`hasher exit ${code}`))));
});
