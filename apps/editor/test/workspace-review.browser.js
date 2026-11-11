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
  const patched=await docling.review('workspace-review-change',{...base,baseline:proposed.baseline,requestId:await page.evaluate(()=>crypto.randomUUID()),change:{kind:'groups-approve',groupId:group.id,targetIds:['body'],human:{actor:'person',reason:'Compared exact paragraph and proposal',confirmed:true},resolvesIssue:true}});
  expect(patched.receipt.outcome).toBe('success');
  await page.getByRole('button',{name:'Refresh data',exact:true}).click();
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
    for(const theme of ['light','dark']){
      await chooseTheme(theme);await expect.poll(pageRegions).toEqual(regions);
      await page.screenshot({path:`docs/design/assets/docling-workspace-s3/compare-1440-${theme}.png`,mask:[page.locator('.sidebar-host-account')],maskColor:'#a1a1aa'});
    }
  }
  await exportButton().click();await expect(page.getByLabel('Output file',{exact:true})).toHaveValue(/검수중\.md$/);
  await page.getByRole('button',{name:'Export current state',exact:true}).click();
  await expect(page.getByRole('button',{name:'Open document',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).last().click();
  if(screenshots){for(const theme of ['light','dark']){
    await chooseTheme(theme);
    await exportButton().click();await expect(page.getByText('Replace the existing document',{exact:true})).toBeVisible();
    await page.screenshot({path:`docs/design/assets/docling-workspace-s3/export-1440-${theme}.png`,mask:[page.locator('.sidebar-host-account')],maskColor:'#a1a1aa'});
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
