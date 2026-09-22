import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { menuCommand } from "../menu-helpers.js";

test("Application menus share commands, keyboard navigation and disabled states", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.getByRole("menubar")).toBeVisible();
  await expect(page.locator(".workspace-panels")).toBeHidden();
  await page.locator("#menu-file").click();
  await page.locator("#menu-model").click();
  await expect(page.locator("#application-menu")).toBeVisible();
  await expect(page.locator("#menu-model")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.locator("#menu-model").click();
  await expect(page.locator("#application-menu")).toBeHidden();
  await page.locator("#viewport").focus();
  await page.keyboard.press("F10");
  await expect(page.locator("#menu-file")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const popup = page.locator("#application-menu");
  await expect(
    popup.getByRole("menuitem", { name: "Undo", exact: true }),
  ).toBeFocused();
  await expect(
    popup.getByRole("menuitem", { name: "Undo", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#menu-view")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu-view")).toBeFocused();
  await expect(popup).toBeHidden();
  await menuCommand(page, "Model", "Place node");
  await expect(page.locator("#add-node-tool")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await menuCommand(page, "Analysis", "Analyse");
  await expect(page.locator("#result-status")).toContainText("Current");
  await menuCommand(page, "Analysis", "Member forces");
  await expect(page.locator("#result-family")).toHaveValue("forces");
  await page.locator("#inertia-y").fill("0.00003");
  await page.locator("#menu-file").click();
  await expect(
    popup.getByRole("menuitem", { name: "New frame", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.locator("#inertia-y")).toHaveValue("0.00003");
  await page.keyboard.press("Escape");
  await page.locator("#discard-properties").click();
  await menuCommand(page, "Help", "Keyboard shortcuts");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeVisible();
  await expect(page.locator("#shortcut-help")).toContainText(
    "Download project",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#shortcut-help")).toBeHidden();
});

test("Shortcuts respect text fields, preserve focus mode and use actual analysis", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#hash-status")).toHaveText(/[a-f0-9]{12} · f64/);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#project-name").fill("Named model");
  await page.keyboard.press("n");
  await expect(page.locator("#add-node-tool")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#viewport").focus();
  await page.keyboard.press("ControlOrMeta+Shift+f");
  await expect(page.locator(".command-ribbon")).toBeHidden();
  await page.keyboard.press("n");
  await expect(page.locator("#add-node-tool")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".command-ribbon")).toBeHidden();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+Shift+f");
  await expect(page.locator(".command-ribbon")).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.locator("#result-status")).toContainText("Current");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#viewport").focus();
  const download = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+s");
  expect((await download).suggestedFilename()).toMatch(/json$/);
});
