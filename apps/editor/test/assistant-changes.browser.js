async (page, { expect, openFolderPicker, fileActionsRoot, screenshots, brand, activeDocument, applyAssistantChange, prepareAssistantImage }) => {
  const origin = page.url().split('/').slice(0,3).join('/'), root = fileActionsRoot;
  const file = root + (root.includes('\\') ? '\\' : '/') + 'a.md';
  const saved = await (await page.request.get(origin + '/api/document?path=' + encodeURIComponent(file), { headers: { Connection: 'close' } })).json();
  const after = prepareAssistantImage();
  expect(after).not.toBe(saved.source);
  const settings = { provider:'codex', permissionMode:'opened-folders', model:'gpt-6-luna', reasoningEffort:'low', responseLanguage:'en' };
  const conversation = { id:'staged-thread', title:'Edit document', folders:[root], ...settings, createdAt:Date.now(), updatedAt:Date.now(), turns:[{id:'turn',status:'inProgress',items:[]}] };
  let screenRequest, screenReply, screenActionRequest, screenActionReply, releaseSend;
  let pending = false, changed = false, applied = false, submissionId, copyRevision="copy", listPolls=0;
  await page.route('**/api/assistant/settings*', route => route.fulfill({json:settings}));
  await page.route('**/api/assistant/diagnostics*', route => route.fulfill({json:{provider:'codex',connected:true,account:{type:'chatgpt'}}}));
  await page.route('**/api/assistant/models*', route => route.fulfill({json:{provider:'codex',models:[{id:settings.model,model:settings.model,displayName:'Luna',supportedReasoningEfforts:[{reasoningEffort:'low'}]}]}}));
  await page.route('**/api/assistant/conversations*', async route => {
    const request = route.request(), input = request.method()==='POST' ? request.postDataJSON() : {};
    if(input.action==='screen-action-result') { screenActionReply=input.reply; screenActionRequest=undefined; return route.fulfill({json:{acknowledged:true}}); }
    if(input.action==='screen-result') { screenReply=input.reply; screenRequest=undefined; return route.fulfill({json:{acknowledged:true}}); }
    if(input.action==='changes-list') { listPolls++; return route.fulfill({json:pending ? [{id:'change',path:file,copyRevision}] : []}); }
    if(input.action==='changes-preview') return route.fulfill({json:{path:file,before:saved.source,after,changed,missing:false,copyRevision:'copy',diskRevision:'disk'}});
    if(input.action==='changes-apply') { applyAssistantChange(after); applied=true; pending=false; return route.fulfill({json:{outcome:'applied'}}); }
    if(input.action==='changes-discard') { pending=false; return route.fulfill({json:{outcome:'discarded'}}); }
    if(input.action==='send') { if(submissionId) await new Promise(resolve=>{releaseSend=resolve;}); submissionId=input.submissionId; conversation.turns[0].items=[{id:'user',kind:'user',text:'Edit the document',submissionId}]; return route.fulfill({json:{submission:{id:submissionId,status:'accepted',conversationId:conversation.id},conversation}}); }
    if(request.url().includes('submissionId=')) return route.fulfill({json:{submission:{id:submissionId,status:'accepted',conversationId:conversation.id},conversation}});
    return route.fulfill({json:request.method()==='GET' && !request.url().includes('?id=') ? [conversation] : {...conversation,screenRequest,screenActionRequest}});
  });
  await openFolderPicker(page); await page.getByTestId('folder-path').fill(root); await page.getByTestId('folder-open').click();
  await page.getByRole('treeitem',{name:'a.md',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:/^Assistant(?: — |$)/}).click();
  const panel=page.getByTestId('assistant-panel');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  if(screenshots) await page.screenshot({mask:[page.locator(".sidebar-host-account")],path:'tmp/1494-evidence/before-1440.png'});
  await panel.getByRole('textbox').fill('Edit the document'); await panel.getByRole('button',{name:'Send message',exact:true}).click();
  pending=true;
  await expect(panel.getByRole('button',{name:'Review',exact:true})).toBeVisible();
  if(screenshots) await page.screenshot({mask:[page.locator(".sidebar-host-account")],path:'tmp/1494-evidence/pending-1440.png'});
  const row=panel.locator('.assistant-composer .assistant-change-row');
  await expect(row).toContainText('a.md');
  const rowBox=await row.boundingBox(), inputBox=await panel.getByRole('textbox').boundingBox();
  expect(rowBox.y+rowBox.height).toBeLessThanOrEqual(inputBox.y);
  await expect(page.getByTestId('assistant-change-comparison')).toHaveCount(0);
  await panel.getByRole('textbox').fill('Next request');
  conversation.turns[0].status='completed';
  const compare=page.getByTestId('assistant-change-comparison');
  await expect(compare.locator('.visual-comparison-grid')).toContainText('Proposed change.');
  await expect(compare.getByRole('button',{name:'Apply',exact:true})).toBeEnabled();
  await expect.poll(()=>compare.getByRole('img',{name:'Imported desk'}).evaluateAll(images=>images.every(img=>img.complete && img.naturalWidth>0) && images.length>0)).toBe(true);
  await expect(panel.getByRole('textbox')).toBeFocused();
  await expect(page.getByRole('tab',{name:/Pending changes/})).toHaveCount(1);
  await page.getByRole('tab',{name:/a.md/}).first().click();
  const observed=listPolls;
  await expect.poll(()=>listPolls).toBeGreaterThan(observed+1);
  await expect(activeDocument(page).locator('.tiptap')).toContainText('Alpha.');
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  if(screenshots) await page.screenshot({mask:[page.locator(".sidebar-host-account")],path:'tmp/1494-evidence/compare-1440.png'});
  // The sending window identifies a pending-copy comparison without leaking its contents.
  screenRequest={id:'staged-screen',validForMs:10000};
  await expect.poll(()=>screenReply?.activeTab?.kind).toBe('staged-comparison');
  expect(screenReply.activeTab.path).toBe(file);
  expect(screenReply.activeTab.hostId).toBe('local');
  expect(screenReply.tabs.find(tab=>tab.id===screenReply.activeTab.id)).toEqual(screenReply.activeTab);
  expect(JSON.stringify(screenReply)).not.toContain('Proposed change.');
  await compare.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(compare.getByRole('status')).toContainText('Changes applied');
  await page.getByRole('tab',{name:/a.md/}).first().click();
  await expect(activeDocument(page).locator('.tiptap')).toContainText('Proposed change.');
  await expect(activeDocument(page).getByRole('img',{name:'Imported desk'})).toBeVisible();
  pending=true; applied=false;
  await expect(panel.getByRole('button',{name:'Review',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  // P1: automatic reload must retain edits typed while its GET is outstanding.
  await page.setViewportSize({width:1920,height:1000});
  await page.getByRole('tab',{name:/Pending changes/}).click({button:'right'});
  await page.getByRole('menuitem',{name:'Open to the right',exact:true}).click();
  const original=page.locator('[data-document-tab][data-visible="true"]').filter({has:page.locator('.tiptap')});
  await expect(original.locator('.tiptap')).toBeVisible();
  let releaseReload, reloadHeld=false;
  await page.route('**/api/document?*', async route=>{
    if(route.request().method()!=='GET' || !route.request().url().includes('path='+encodeURIComponent(file))) return route.fallback();
    const response=await route.fetch({headers:{Connection:'close'}});
    reloadHeld=true;
    await new Promise(resolve=>{releaseReload=resolve;});
    await route.fulfill({response});
  });
  await compare.getByRole('button',{name:'Apply',exact:true}).click();
  await expect.poll(()=>reloadHeld).toBe(true);
  await original.locator('.tiptap p').first().click();
  await page.keyboard.press('End'); await page.keyboard.type(' during reload');
  releaseReload();
  await expect(compare.getByRole('alert')).toContainText('Changes applied on disk.');
  await expect(original.locator('.tiptap')).toContainText('during reload');
  await page.unroute('**/api/document?*');
  await page.keyboard.press('Control+z');
  await expect(original.locator('.tiptap')).not.toContainText('during reload');
  await page.getByRole('tab',{name:/Pending changes/}).click({button:'right'});
  await page.getByRole('menuitem',{name:'Move to other group',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  pending=true; applied=false;
  await expect(panel.getByRole('button',{name:'Review',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  changed=true;
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  await expect(compare.getByRole('button',{name:'Apply',exact:true})).toBeDisabled();
  await expect(compare.getByRole('alert')).toContainText('The original changed.');
  changed=false;
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  // Unsaved human edits stay protected even when the disk revision is unchanged.
  await page.getByRole('tab',{name:/a.md/}).first().click();
  await activeDocument(page).locator('.tiptap p').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' unsaved');
  await page.getByRole('tab',{name:/Pending changes/}).click();
  await compare.getByRole('button',{name:'Apply',exact:true}).click();
  await expect(compare.getByRole('alert')).toContainText('unsaved edits'); expect(applied).toBe(false);
  // A later turn editing the same copy refreshes the existing tab once.
  await page.getByRole('tab',{name:/a.md/}).first().click();
  await panel.getByRole('textbox').fill('Revise the pending copy again');
  await panel.getByRole('button',{name:'Send message',exact:true}).click();
  await expect.poll(()=>typeof releaseSend).toBe('function');
  copyRevision='copy-2';
  const waitingPoll=listPolls;
  await expect.poll(()=>listPolls).toBeGreaterThan(waitingPoll+1);
  await expect(activeDocument(page).locator('.tiptap')).toContainText('unsaved');
  conversation.turns.push({id:'turn-2',status:'inProgress',items:[]});
  releaseSend();
  await expect(panel.getByRole('button',{name:'Stop response',exact:true})).toBeVisible();
  conversation.turns[1].status='completed';
  await expect(compare.getByRole('button',{name:'Apply',exact:true})).toBeVisible();
  // P2: completing another document's edit must not hide a document being typed in.
  conversation.turns.push({id:'turn-3',status:'inProgress',items:[]});
  await expect(panel.getByRole('button',{name:'Stop response',exact:true})).toBeVisible();
  await page.getByRole('treeitem',{name:'b.md',exact:true}).click();
  const other=page.locator('[data-document-tab][data-visible="true"]').filter({has:page.locator('.document-editor')});
  await expect(other).toContainText('Beta.');
  await other.locator('.tiptap p').first().click();
  await page.keyboard.press('End'); await page.keyboard.type(' Working on B');
  copyRevision='copy-3'; conversation.turns[2].status='completed';
  const finishingPoll=listPolls;
  await expect.poll(()=>listPolls).toBeGreaterThan(finishingPoll+1);
  await expect(activeDocument(page).locator('.tiptap')).toContainText('Working on B');
  await expect(activeDocument(page).locator('.tiptap')).toBeFocused();
  await panel.getByRole('button',{name:'Review',exact:true}).click();
  await expect(compare).toBeVisible();
  // Narrow Korean dark review remains usable with the existing responsive comparison.
  if(screenshots) {
    await page.evaluate(prefix=>{localStorage.setItem(prefix+'.uiLanguage','ko');localStorage.setItem(prefix+'.theme','dark');},brand.storagePrefix);
    await page.reload();
    await page.setViewportSize({width:640,height:900});
    await page.getByRole('button',{name:/^비서(?: — |$)/}).click();
    await expect(panel.getByRole('button',{name:'검토',exact:true})).toBeVisible();
    await panel.getByRole('button',{name:'검토',exact:true}).click();
    await expect(compare.locator('.visual-comparison-grid')).toContainText('Proposed change.');
    await page.screenshot({mask:[page.locator(".sidebar-host-account")],path:'tmp/1494-evidence/compare-640-ko-dark.png'});
  }
  await compare.getByRole('button',{name:/^(Discard|버리기)$/}).click();
  await expect(compare.getByRole('status')).toContainText(/Changes discarded|변경 버림/);
  await expect(panel.getByRole('button',{name:/^(Review|검토)$/})).toHaveCount(0);
  await page.evaluate(prefix=>{localStorage.setItem(prefix+'.uiLanguage','en');localStorage.setItem(prefix+'.theme','light');},brand.storagePrefix);
  await page.getByRole('tab',{name:/a.md/}).first().click();
  screenActionRequest={id:'close-tabs',validForMs:10000,action:{kind:'close_tabs',tabIds:'all'}};
  await expect.poll(()=>screenActionReply?.outcome).toBe('conflict');
  expect(screenActionReply.remaining.some(item=>/Unsaved/.test(item.reason))).toBe(true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(activeDocument(page).locator('.tiptap')).toContainText('unsaved');
  screenActionReply=undefined;
  screenActionRequest={id:'close-folders',validForMs:10000,action:{kind:'close_folders',folders:'all'}};
  await expect.poll(()=>screenActionReply?.outcome).toBe('success');
  expect(screenActionReply.completed.length).toBeGreaterThan(0);
  screenActionReply=undefined;
  screenActionRequest={id:'open-folder',validForMs:10000,action:{kind:'open_folder',hostId:'local',path:root}};
  await expect.poll(()=>screenActionReply?.outcome).toBe('success');
  await expect(page.getByRole('treeitem',{name:'a.md',exact:true})).toBeVisible();

  return { pendingCard:true, wideCompare:true, unsavedEditsPreserved:true };
}
