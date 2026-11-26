async (page, { expect, pluginFixture, openFolderPicker, screenshots, waitForExplorerLayout }) => {
  const { folder, plugins: [converter, mail] } = pluginFixture.fileActions;
  const cli = pluginFixture.cli;
  const row = name => page.getByRole("treeitem", { name, exact: true });
  const tab = name => page.getByRole("tab", { name, exact: true });
  const action = name => page.getByRole("menuitem", { name, exact: true });
  const fileMenu = name => page.getByRole("button", { name, exact: true });
  const chooser = name => page.getByRole("dialog", { name, exact: true });
  const workspace = page.getByTestId("view-workspace").filter({ visible: true });
  const output = workspace.locator("output");
  const pdf = row("Preview.pdf");
  const proposal = row("Proposal.DOCX");
  const message = row("Message.eml");
  const openTabMenu = async (name = "File actions") => {
    await fileMenu(name).click();
    await expect(action("Convert document")).toBeVisible();
  };
  const configure = async (language, theme) => {
    await page.getByTestId("activity-bar").locator("[data-open-settings]").click();
    await page.getByTestId("theme").selectOption(theme);
    await page.getByTestId("ui-language").selectOption(language);
    await page.locator('[data-tab-id="settings"] .document-tab-close').click();
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const plugin of [converter, mail]) {
    expect(cli(["plugins", "install", plugin.directory]).receipt.outcome).toBe("success");
  }
  if (screenshots) await configure("en", "light");
  await openFolderPicker(page);
  await page.getByTestId("folder-path").fill(folder);
  await page.getByTestId("folder-open").click();
  await expect(pdf).toBeVisible();
  await expect(page.getByTestId("activity-bar").getByRole("button", { name: converter.name, exact: true })).toBeVisible();
  await expect(page.getByTestId("activity-bar").getByRole("button", { name: mail.name, exact: true })).toBeVisible();

  if (screenshots) {
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      const bar = page.getByTestId("activity-bar");
      await page.screenshot({ path: `tmp/plugin-file-actions-${name}.png`, animations: "disabled",
        mask: [bar.locator(".activity-bar-status")], maskColor: await bar.evaluate(node => getComputedStyle(node).backgroundColor) });
    };
    await pdf.click();
    await expect(tab("Preview.pdf")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".pdf-viewer .textLayer").first().getByText("Selectable PDF text", { exact: true })).toBeVisible();
    await pdf.click({ button: "right" });
    await expect(action("Convert document")).toBeVisible();
    await capture("explorer-1440-light");
    await page.keyboard.press("Escape");
    await openTabMenu();
    await capture("pdf-tab-1440-light");
    await page.keyboard.press("Escape");
    await message.click();
    await expect(chooser("Choose a plugin to open this file")).toBeVisible();
    await capture("chooser-1440-light");
    await page.keyboard.press("Escape");

    await configure("ko", "dark");
    await message.click();
    await expect(chooser("이 파일을 열 플러그인 선택")).toBeVisible();
    await capture("chooser-1440-ko-dark");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 640, height: 900 });
    await waitForExplorerLayout(page);
    const collapse = page.getByRole("button", { name: "탐색기 접기", exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await expect(tab("Preview.pdf")).toHaveAttribute("aria-selected", "true");
    await tab("Preview.pdf").focus();
    await page.mouse.move(500, 400);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await openTabMenu("파일 작업");
    await capture("pdf-tab-640-ko-dark");
    return;
  }

  const docx = await proposal.getAttribute("data-path");
  const pdfPath = await pdf.getAttribute("data-path");
  const options = cli(["plugins", "file-actions", docx]);
  expect(options.receipt).toMatchObject({ operation: "plugins.file-actions", scope: "host", version: 1, outcome: "success" });
  expect(options.fileActions).toMatchObject([{ plugin: converter.id, id: "open", screenId: "main", openByDefault: true }]);

  await pdf.dblclick();
  await expect(tab("Preview.pdf")).toHaveAttribute("aria-selected", "true");
  await expect(tab(converter.name)).toHaveCount(0);
  await pdf.click({ button: "right" });
  await action("Convert document").click();
  await expect(output).toHaveAttribute("title", pdfPath);
  await workspace.getByRole("button", { name: "Count: 0", exact: true }).click();

  await tab("Preview.pdf").click();
  await openTabMenu();
  await action("Convert document").click();
  await expect(output).toHaveAttribute("title", pdfPath);
  await expect(workspace.getByRole("button", { name: "Count: 1", exact: true })).toBeVisible();
  const before = Number(await output.getAttribute("data-request"));

  await proposal.dblclick();
  await expect(output).toHaveAttribute("title", docx);
  await expect(output).toHaveAttribute("data-request", String(before + 1));
  await expect(tab(converter.name)).toHaveCount(1);
  await proposal.click({ button: "right" });
  await action("File information").click();
  await expect(chooser("Proposal.DOCX")).toBeVisible();
  await page.keyboard.press("Escape");

  await row("Outline.md").click();
  await expect(tab("Outline.md")).toHaveAttribute("aria-selected", "true");
  await openTabMenu();
  await action("Convert document").click();
  await expect(output).toHaveText("Outline.md");

  await message.press("Enter");
  const choices = chooser("Choose a plugin to open this file");
  await expect(choices.getByRole("button", { name: "Document tools · Convert document", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(choices).toHaveCount(0);
  await expect(message).toBeFocused();
  await message.press("Space");
  await choices.getByRole("button", { name: "Mail tools · Inspect message", exact: true }).click();
  await expect(output).toHaveText("Message.eml");
  await expect(tab(mail.name)).toHaveAttribute("aria-selected", "true");

  expect(cli(["plugins", "disable", converter.id]).receipt.outcome).toBe("success");
  await expect(page.getByTestId("activity-bar").getByRole("button", { name: converter.name, exact: true })).toHaveCount(0);
  expect(cli(["plugins", "file-actions", docx]).fileActions).toEqual([]);
  await tab("Preview.pdf").click();
  await expect(fileMenu("File actions")).toHaveCount(0);
  await proposal.click();
  await expect(chooser("Proposal.DOCX")).toBeVisible();
  await page.keyboard.press("Escape");

  expect(cli(["plugins", "unregister", mail.id]).receipt.outcome).toBe("success");
  await expect(page.getByTestId("activity-bar").getByRole("button", { name: mail.name, exact: true })).toHaveCount(0);
  await message.click();
  await expect(chooser("Message.eml")).toBeVisible();
}
