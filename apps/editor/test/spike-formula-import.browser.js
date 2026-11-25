async (page, { expect, pluginFixture, openFolderPicker, waitForExplorerLayout }) => {
  const root = pluginFixture.directory.replace(/plugin-artifact$/, "formula-mission");
  try { pluginFixture.cli(["plugins", "install", root + "/pdf-import"]); }
  catch (error) { throw new Error(error.stdout?.toString() || error.message); }
  await page.reload();
  await waitForExplorerLayout(page);
  const expand = page.getByRole("button", { name: /^(Expand Explorer|탐색기 펼치기)$/ });
  if (await expand.isVisible()) await expand.click();
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(root);
  await page.getByTestId("folder-open").click();
  await page.getByTestId("activity-bar").getByRole("button", { name: "PDF 가져오기", exact: true }).click();
  await page.getByRole("button", { name: "PDF 고르기", exact: true }).click();
  const picker = page.getByRole("dialog", { name: /Choose PDF|PDF 고르기/ });
  await picker.getByRole("option", { name: "LSR-1.1-standards.pdf", exact: true }).dblclick();
  await expect(page.getByText("뺄 쪽을 고른 뒤 변환하세요.", {exact:true})).toBeVisible({timeout:30000});
  await page.getByRole("button", { name: "변환", exact: true }).click();
  await expect(page.getByText(/^변환 완료 · 변환 경고 /).first()).toBeVisible({timeout:60000});
}
