export async function menuCommand(page, menu, name) {
  await page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: menu, exact: true })
    .click();
  const popup = page.locator("#application-menu");
  await popup
    .getByRole("menuitem", { name, exact: true })
    .or(popup.getByRole("menuitemcheckbox", { name, exact: true }))
    .click();
}
