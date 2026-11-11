async (page, { expect, openFolderPicker, fileActionsRoot, screenshots, brand, activeDocument }) => {
  const origin = page.url().split('/').slice(0,3).join('/'), root = fileActionsRoot;
  const file = root + (root.includes('\\') ? '\\' : '/') + 'a.md';
  const saved = await (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(file), { headers: { Connection: 'close' } })).json();
  const after = saved.source.replace('Alpha.', 'Proposed change.');
  expect(after).not.toBe(saved.source);
  const settings = { provider:'codex', permissionMode:'opened-folders', model:'gpt-6-luna', reasoningEffort:'low', responseLanguage:'en' };
  const conversation = { id:'staged-thread', title:'Edit document', folders:[root], ...settings, createdAt:Date.now(), updatedAt:Date.now(), turns:[{id:'turn',status:'completed',items:[]}] };
  let pending = false, changed = false, applied = false, submissionId;
  await page.route('**/api/assistant/settings*', route => route.fulfill({json:settings}));
  await page.route('**/api/assistant/diagnostics*', route => route.fulfill({json:{provider:'codex',connected:true,account:{type:'chatgpt'}}}));
  await page.route('**/api/assistant/models*', route => route.fulfill({json:{provider:'codex',models:[{id:settings.model,model:settings.model,displayName:'Luna',supportedReasoningEfforts:[{reasoningEffort:'low'}]}]}}));
  await page.route('**/api/assistant/conversations*', async route => {
    const request = route.request(), input = request.method()==='POST' ? request.postDataJSON() : {};
    if(input.action==='changes-list') return route.fulfill({json:pending ? [{id:'change',path:file}] : []});
    if(input.action==='changes-preview') return route.fulfill({json:{path:file,before:saved.source,after,changed,missing:false,copyRevision:'copy',diskRevision:'disk'}});
    if(input.action==='changes-apply') { applied=true; pending=false; return route.fulfill({json:{outcome:'applied'}}); }
    if(input.action==='changes-discard') { pending=false; return route.fulfill({json:{outcome:'discarded'}}); }
    if(input.action==='send') { submissionId=input.submissionId; conversation.turns[0].items=[{id:'user',kind:'user',text:'Edit the document',submissionId}]; return route.fulfill({json:{submission:{id:submissionId,status:'accepted',conversationId:conversation.id},conversation}}); }
    if(request.url().includes('submissionId=')) return route.fulfill({json:{submission:{id:submissionId,status:'accepted',conversationId:conversation.id},conversation}});
    return route.fulfill({json:request.method()==='GET' && !request.url().includes('?id=') ? [conversation] : conversation});
  });
  await openFolderPicker(page); await page.getByTestId('folder-path').fill(root); await page.getByTestId('folder-open').click();
  await page.getByRole('treeitem',{name:'a.md',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:/^Assistant(?: — |$)/}).click();
  const panel=page.getByTestId('assistant-panel');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  if(screenshots) await page.screenshot({mask:[page.getByText(/BSW-HOME/)],path:'tmp/1494-evidence/before-1440.png'});
  await panel.getByRole('textbox').fill('Edit the document'); await panel.getByRole('button',{name:'Send message',exact:true}).click();
  pending=true;
  await expect(panel.getByRole('button',{name:'Review',exact:true})).toBeVisible();
  if(screenshots) await page.screenshot({mask:[page.getByText(/BSW-HOME/)],path:'tmp/1494-evidence/pending-1440.png'});
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  const compare=page.getByTestId('assistant-change-comparison');
  await expect(compare.locator('.visual-comparison-grid')).toContainText('Proposed change.');
  await expect(compare.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
  if(screenshots) await page.screenshot({mask:[page.getByText(/BSW-HOME/)],path:'tmp/1494-evidence/compare-1440.png'});
  // Unsaved human edits stay protected even when the disk revision is unchanged.
  await page.getByRole('tab',{name:/a.md/}).first().click();
  await activeDocument(page).locator('.tiptap p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' unsaved');
  await page.getByRole('tab',{name:/Pending changes/}).click();
  await compare.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(compare.getByRole('alert')).toContainText('unsaved edits'); expect(applied).toBe(false);
  // Narrow Korean dark review remains usable with the existing responsive comparison.
  if(screenshots) {
    await page.evaluate(prefix=>{localStorage.setItem(prefix+'.uiLanguage','ko');localStorage.setItem(prefix+'.theme','dark');},brand.storagePrefix);
    await page.reload();
    await page.setViewportSize({width:640,height:900});
    await page.getByRole('button',{name:/^비서(?: — |$)/}).click();
    await expect(panel.getByRole('button',{name:'검토',exact:true})).toBeVisible();
    await panel.getByRole('button',{name:'검토',exact:true}).click();
    await expect(compare.locator('.visual-comparison-grid')).toContainText('Proposed change.');
    await page.screenshot({mask:[page.getByText(/BSW-HOME/)],path:'tmp/1494-evidence/compare-640-ko-dark.png'});
  }
  await compare.getByRole('button',{name:/^(Discard|버리기)$/}).click();
  await expect(compare.getByRole('status')).toContainText(/Changes discarded|변경 버림/);
  await expect(panel.getByRole('button',{name:/^(Review|검토)$/})).toHaveCount(0);
  await page.evaluate(prefix=>{localStorage.setItem(prefix+'.uiLanguage','en');localStorage.setItem(prefix+'.theme','light');},brand.storagePrefix);
  return { pendingCard:true, wideCompare:true, unsavedEditsPreserved:true };
}
