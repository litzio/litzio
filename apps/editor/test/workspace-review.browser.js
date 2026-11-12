// Actual SDK artifact -> fileless review -> persistent progress/patch -> cold Host -> explicit export.
async (page, {expect,pluginFixture,openFolderPicker,screenshots}) => {
  const docling=pluginFixture.docling,root=pluginFixture.folder;
  await docling.cli(['plugins','register',docling.directory]);
  const plugin=(await docling.cli(['plugins','list'])).plugins.find(p=>p.id==='community.docling');
  await docling.cli(['plugins','trust','community.docling','--registration',plugin.registrationId]);
  await docling.cli(['plugins','enable','community.docling']);
  const workspace=docling.realFile??'sample.docling',base={root,workspace,plugin:'community.docling',job:'create-document'};
  await page.route('**/api/host-capabilities',route=>route.fulfill({json:{fileDeletion:'trash',identity:{runAs:'Example User'}}}));
  await page.setViewportSize({width:1440,height:900});
  await openFolderPicker(page);await page.getByTestId('folder-path').fill(root);await page.getByTestId('folder-open').click();
  const row=()=>page.getByTestId('sidebar').getByRole('treeitem',{name:workspace,exact:true});
  const open=async()=>{await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});await row().focus();await row().press('Enter');await expect(page.locator('.review-renderer')).toBeVisible();await page.locator('.review-region').first().waitFor({state:'visible'});await expect(page.locator('.review-region').first()).toBeEnabled();await expect(page.locator('.review-image-loading')).toHaveCount(0);};
  await open();
  await expect(page.getByRole('button',{name:'Open document',exact:true})).toHaveCount(0);
  // The active comparison is advisory path context; no internal provider/job values in send.
  const settings={provider:'codex',permissionMode:'opened-folders',model:'gpt-6.1-sol',reasoningEffort:'medium'};
  await page.route('**/api/assistant/settings*',route=>route.fulfill({json:settings}));
  await page.route('**/api/assistant/models*',route=>route.fulfill({json:{provider:'codex',models:[{id:'sol',model:settings.model,displayName:'Sol',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'}]}]}}));
  await page.route('**/api/assistant/diagnostics*',route=>route.fulfill({json:{provider:'codex',connected:true,account:{type:'chatgpt'}}}));
  let sent;
  const conversation={id:'review-context',title:'Review',folders:[root],createdAt:Date.now(),updatedAt:Date.now(),...settings,turns:[]};
  await page.route('**/api/assistant/conversations*',route=>{
    const body=route.request().method()==='POST'?route.request().postDataJSON():null;
    if(body?.action==='send'){
      sent=body;
      conversation.turns=[{id:'review-turn',status:'completed',items:[{id:'review-user',kind:'user',text:body.message,submissionId:body.submissionId}]}];
      return route.fulfill({json:{submission:{id:body.submissionId,status:'accepted',conversationId:conversation.id},conversation}});
    }
    return route.fulfill({json:route.request().url().includes('?id=')?conversation:[]});
  });
  await page.getByRole('button',{name:/^Assistant(?: — |$)/}).click();
  const panel=page.getByTestId('assistant-panel');
  await expect(panel.getByRole('textbox')).toBeEnabled();
  await panel.getByRole('textbox').fill('Review this document');
  await panel.getByRole('button',{name:'Send message',exact:true}).click();
  await expect.poll(()=>sent?.reviewWorkspace?.path.replaceAll('\\','/')).toBe((root+'/'+workspace).replaceAll('\\','/'));
  expect(sent.document).toBeUndefined();expect(Object.keys(sent.reviewWorkspace)).toEqual(['path']);
  await panel.getByRole('button',{name:'Close assistant',exact:true}).click();
  const state=await docling.review('workspace-read',base);
  expect(state.snapshot.source).toBeTruthy();expect(state.documentPath).toBeUndefined();
  const sourceBeforeExport=state.baseline;
  const documentImages=page.locator('.review-read figure img');
  await expect(documentImages).toHaveCount(state.snapshot.images.length);
  expect(await documentImages.evaluateAll(nodes=>nodes.every(node=>node.src.startsWith('data:image/')&&node.complete&&node.naturalWidth>0))).toBe(true);
  // Corrections go through the same Host operation and explicit Refresh, never the editor draft.
  const target=state.items.find(item=>item.self_ref==='#/texts/4');
  const group={id:'browser-kind',reasonCode:'kind',reason:'Independent paragraph should be a heading',provider:'community.docling',providerVersion:'0.0.11',sourceRevision:state.contentRevision,contentRevision:state.documentRevision,
    createdAt:new Date().toISOString(),runId:'browser',representativeTargetId:'body',representativeReason:'Compared source paragraph',splitFrom:null,
    targets:[{id:'body',locator:{self_ref:target.self_ref},pages:[2],regions:[],before:[{kind:'paragraph'}],
      evidence:[{observation:'Compared original source',materialRef:'page-2',materialHash:state.contentRevision,inspector:'human',scope:{pages:[2],targets:['body']}}],
      patch:{expectedBefore:[{kind:'paragraph'}],expectedContentRevision:state.documentRevision,operations:[{type:'kind',self_ref:target.self_ref,kind:'heading',level:2}],after:[{kind:'heading',level:2}],supported:true,deferredReason:null},
      inspection:'uncertain',proposal:'proposed',result:null,resolved:false,history:[]}]};
  const proposed=await docling.review('workspace-review-change',{...base,baseline:state.baseline,requestId:await page.evaluate(()=>crypto.randomUUID()),change:{kind:'groups-propose',groups:[group]}});
  expect(proposed.receipt.outcome).toBe('success');
  await page.getByRole('button',{name:'Refresh data',exact:true}).click();
  const list=page.getByRole('complementary',{name:'문제 묶음·후보'});
  await list.getByRole('button',{name:'2쪽 · 검토 대기',exact:true}).click();
  await expect(page.locator('.review-highlights > div')).toHaveCount(1);
  await expect(list.locator('[aria-current=page]')).toHaveCount(1);
  const treeRowHeight=await page.locator('.sidebar-tree-item[data-path]').first().evaluate(e=>e.getBoundingClientRect().height);
  expect(await list.locator('.workspace-review-row').evaluateAll((rows,height)=>Math.max(...rows.map(row=>Math.abs(row.getBoundingClientRect().height-height))),treeRowHeight)).toBeLessThan(1);
  await expect(page.locator('.review-region[aria-pressed="true"]').first()).toBeVisible();
  await page.getByLabel('판단 사유',{exact:true}).fill('Compared exact paragraph and proposal');
  await page.getByRole('button',{name:'승인',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.groups.find(g=>g.id===group.id).targets[0].proposal).toBe('approved');
  await expect(page.getByRole('button',{name:'되돌리기',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'되돌리기',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.groups.find(g=>g.id===group.id).targets[0].proposal).toBe('proposed');
  await expect(page.getByRole('button',{name:'거절',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'거절',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.groups.find(g=>g.id===group.id).targets[0].proposal).toBe('rejected');
  const rejected=await docling.review('workspace-read',base);
  const second={...group,id:'browser-kind-second',contentRevision:rejected.documentRevision};
  await docling.review('workspace-review-change',{...base,baseline:rejected.baseline,requestId:await page.evaluate(()=>crypto.randomUUID()),change:{kind:'groups-propose',groups:[second]}});
  await page.getByRole('button',{name:'Refresh data',exact:true}).click();
  await list.getByRole('button',{name:'2쪽 · 검토 대기',exact:true}).click();
  await page.getByLabel('판단 사유',{exact:true}).fill('Compared source again');
  await page.getByRole('button',{name:'승인',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.groups.find(g=>g.id===second.id).targets[0].proposal).toBe('approved');
  // Page exclusion uses the same ledger proposal/approval and restores source mappings on Undo.
  await page.getByRole('button',{name:'쪽 펼치기',exact:true}).click();
  const pages=page.getByRole('complementary',{name:'쪽 선택·제외'});
  const headers=await page.locator('.workspace-review-list > header, .workspace-review-proposal > summary, .workspace-review-pages > header').evaluateAll(elements=>elements.map(e=>({top:e.getBoundingClientRect().top,height:e.getBoundingClientRect().height})));
  expect(headers).toHaveLength(3);
  expect(Math.max(...headers.map(h=>h.top))-Math.min(...headers.map(h=>h.top))).toBeLessThan(1);
  expect(Math.max(...headers.map(h=>h.height))-Math.min(...headers.map(h=>h.height))).toBeLessThan(1);
  await expect(pages.getByRole('button',{name:'제외 묶음 만들기',exact:true})).toHaveCount(0);
  await pages.getByRole('checkbox').first().check();
  await page.getByRole('button',{name:'제외 묶음 만들기',exact:true}).click();
  const proposal=page.locator('.workspace-review-proposal');
  await expect(pages.getByRole('button',{name:'제외 묶음 만들기',exact:true})).toHaveCount(0);
  await expect(list.getByText('쪽 제외',{exact:true})).toBeVisible();
  await proposal.getByLabel('판단 사유',{exact:true}).fill('Exclude cover blocks');
  await expect(proposal.getByRole('button',{name:'승인',exact:true})).toBeEnabled();
  await proposal.getByRole('button',{name:'승인',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.groups.find(g=>g.reasonCode==='page-exclusion')?.targets.every(t=>t.proposal==='approved')).toBe(true);
  await expect(proposal.getByRole('button',{name:'되돌리기',exact:true})).toBeEnabled();
  await proposal.getByRole('button',{name:'되돌리기',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.groups.find(g=>g.reasonCode==='page-exclusion')?.targets.every(t=>t.proposal==='proposed')).toBe(true);
  await page.getByRole('button',{name:'쪽 접기',exact:true}).click();
  const required=(await docling.review('workspace-read',base)).ledger.inventory.requiredChecks[0];
  await list.getByRole('button',{name:new RegExp(`^${required.kind==='table'?'표':'그림'} 1 · ${required.pages.length ? required.pages.join(',')+'쪽' : '쪽 미지정'} · 미확인$`)}).first().click();
  await page.getByLabel('판단 사유',{exact:true}).fill('Direct comparison of source and result');
  await page.getByRole('button',{name:'직접 확인 기록',exact:true}).click();
  await expect.poll(async()=>(await docling.review('workspace-read',base)).ledger.checks.some(c=>c.targetIds.includes(required.id))).toBe(true);
  // Return to the first page for the existing progress/cold Host checks below.
  await page.getByLabel('Go to page',{exact:true}).fill('1');
  await page.getByLabel('Go to page',{exact:true}).press('Enter');
  await expect(page.locator('.review-region[data-kind="heading"]').first()).toBeEnabled();
  await page.getByRole('button',{name:'Page 1: Page checked',exact:true}).click();
  await expect(page.getByRole('button',{name:'Page 1: Page checked',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>(await docling.review('workspace-read',base)).record.checkedPages).toContain(1);
  const persisted=await docling.review('workspace-read',base);
  const firstPage=()=>page.locator('.review-source-sheet[data-page-no="1"]');
  const expectedPage=(await docling.review('workspace-compare',{...base,baseline:persisted.baseline,pageNo:1})).snapshot.pages.find(page=>page.pageNo===1);
  await expect(firstPage().locator('.review-region')).toHaveCount(expectedPage.regions.length);
  const pageRegions=()=>firstPage().locator('.review-region').evaluateAll(nodes=>nodes.map(node=>({label:node.getAttribute('aria-label'),kind:node.getAttribute('data-kind')})));
  const regions=await pageRegions();
  // The existing runner stays alive; review requests are proxied to a NEW real isolated Host.
  // This proves cold Host/registration handoff of the one file, without a fake document model.
  let cold=await docling.restartWorkspaceHost();
  await page.route('**/api/reviews',async route=>{
    const response=await route.fetch({url:cold+'/api/reviews',headers:{...route.request().headers(),origin:cold,Connection:'close'}});
    await route.fulfill({response});
  });
  await page.reload();await open();
  await expect(page.getByRole('button',{name:'Page 1: Page checked',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(pageRegions).toEqual(regions);
  cold=await docling.restartWorkspaceHost();await page.reload();await open();
  await expect(page.getByRole('button',{name:'Page 1: Page checked',exact:true})).toHaveAttribute('aria-pressed','true');
  const exportButton=()=>page.getByRole('button',{name:'Export current state…',exact:true});
  const chooseTheme=async theme=>{if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:/^Color mode:/}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);};
  if(screenshots){
    await list.getByRole('button',{name:'2쪽 · 승인함',exact:true}).click();
    await expect(page.locator('.review-highlights > div')).toHaveCount(1);
    await expect(list.locator('[aria-current=page]')).toHaveCount(1);
    await page.getByRole('button',{name:'쪽 펼치기',exact:true}).click();
    for(const theme of ['light','dark']){
      await chooseTheme(theme);await expect.poll(pageRegions).toEqual(regions);
      await page.screenshot({path:`docs/design/assets/review-panel-s6/after-1440-${theme}.png`,mask:[page.locator('.sidebar-host-account')],maskColor:'#a1a1aa'});
    }
  }
  {
    if(screenshots) await page.getByRole('button',{name:'쪽 접기',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByTestId('ui-language').selectOption('ko');
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:640,height:900});
    await expect(page.locator('.review-page-heading button').first()).toHaveText('확인한 페이지');
    // Checked and unchecked page actions must wrap at Korean word boundaries.
    await expect.poll(()=>page.locator('.review-page-heading button').evaluateAll(buttons=>buttons.flatMap(button=>{
      const words=button.textContent.trim().split(/\s+/);
      return words.map(word=>{
        const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);let node;
        while(node=walker.nextNode()){
          const start=node.textContent.indexOf(word);if(start<0)continue;
          const range=document.createRange();range.setStart(node,start);range.setEnd(node,start+word.length);
          return range.getClientRects().length;
        }
        return Infinity;
      });
    }))).toEqual([1,1,1,1]); // 확인한/페이지, 페이지/확인함
    if(screenshots) for(const theme of ['light','dark']){
      if(await page.locator('html').getAttribute('data-theme')!==theme) await page.getByRole('button',{name:/^색상 모드:/}).click();
      await expect(page.getByRole('button',{name:'쪽 펼치기',exact:true})).toBeVisible();
      await page.screenshot({path:`docs/design/assets/review-panel-s6/after-640-${theme}.png`,mask:[page.locator('.sidebar-host-account')],maskColor:'#a1a1aa'});
    }
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByTestId('ui-language').selectOption('en');
    await page.keyboard.press('Escape');
  }
  await exportButton().click();await expect(page.getByLabel('Output file',{exact:true})).toHaveValue(/검수중\.md$/);
  await page.getByRole('button',{name:'Export current state',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open document',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).last().click();
  if(screenshots){for(const theme of ['light','dark']){
    await chooseTheme(theme);
    await exportButton().click();await expect(page.getByText('Replace the existing document',{exact:true})).toBeVisible();
    await page.screenshot({path:`tmp/review-panel-export-1440-${theme}.png`,mask:[page.locator('.sidebar-host-account')],maskColor:'#a1a1aa'});
    await page.getByRole('button',{name:'Close',exact:true}).last().click();
  }}
  await exportButton().click();await expect(page.getByText('Replace the existing document',{exact:true})).toBeVisible();
  const requests=[];page.on('request',request=>{if(request.url().endsWith('/api/reviews')&&request.postDataJSON()?.action==='workspace-export')requests.push(request.postDataJSON());});
  await page.getByRole('button',{name:'Export current state',exact:true}).click();expect(requests).toHaveLength(0);
  await page.getByLabel('Replace the existing document',{exact:true}).check();await page.getByRole('button',{name:'Export current state',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open document',exact:true})).toBeVisible();expect(requests).toHaveLength(1);expect(requests[0].overwrite).toBe(true);
  const after=await docling.review('workspace-read',base);expect(after.baseline).toBe(persisted.baseline);expect(after.snapshot.source).toBe(persisted.snapshot.source);
  expect(sourceBeforeExport).not.toBe(persisted.baseline);
  // End this observer before its owned Host shuts down; drain page routes already in flight.
  await page.getByRole('button',{name:'Close',exact:true}).last().click();
  await page.locator('[data-tab-id^="comparison-"] .document-tab-close').click();
  await expect(page.locator('.review-renderer')).toHaveCount(0);
  await page.unrouteAll({behavior:'wait'});
  await docling.cli(['plugins','disable','community.docling']);
  await docling.cli(['plugins','unregister','community.docling']);
  return {fileless:true,coldHostHandoff:true,restart:true,explicitExport:true,overwriteConfirmation:true,documentRevision:after.documentRevision};
}
