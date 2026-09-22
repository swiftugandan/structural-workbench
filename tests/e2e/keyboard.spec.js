import { test, expect } from "@playwright/test";

// Reach each control using Tab, then type/activate with the keyboard only.
async function reach(page, target) {
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw Error("Control is not reachable with Tab: " + target);
}
async function activate(page, target) {
  await reach(page, target);
  await page.keyboard.press("Enter");
}
async function type(page, target, text) {
  await reach(page, target);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}
test("M01 keyboard-only portal creation, numeric drawing, table editing and solve", async ({
  page,
}) => {
  await page.goto("/");
  await activate(page, page.locator("#new-portal"));
  await type(
    page,
    page.locator("#portal-form").getByLabel("Project name", { exact: true }),
    "Keyboard portal",
  );
  await activate(
    page,
    page.getByRole("button", { name: "Create portal", exact: true }),
  );
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await activate(page, page.locator("#draw-toggle"));
  for (const [name, value] of [
    ["Start X", "0"],
    ["Start Z", "0"],
    ["End X", "4000 mm"],
    ["End Z", "3000 mm"],
  ])
    await type(page, page.getByLabel(name, { exact: true }), value);
  await activate(
    page,
    page.getByRole("button", { name: "Add member", exact: true }),
  );
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  await page.keyboard.press("Escape");
  await activate(page, page.getByRole("button", { name: /Nodes 4/ }));
  await activate(
    page,
    page.getByRole("button", { name: "Edit n3", exact: true }),
  );
  await type(page, page.getByLabel("X m", { exact: true }), "4.5 m");
  await activate(
    page,
    page.getByRole("button", { name: "Save entity", exact: true }),
  );
  await activate(page, page.locator("#close-modal"));
  await activate(page, page.locator("#analyse"));
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
});
