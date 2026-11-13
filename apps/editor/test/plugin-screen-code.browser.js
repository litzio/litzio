async (page, {expect, screenshots, openFolderPicker, openPath, pluginFixture}) => {
  const images = [{key:'chart',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAMAAAABACAIAAADDDu+IAAAA8ElEQVR4nO3SoQ0CQQAAwe8KiaATFDXQAA5Dq4QgseQly+X/kkm2gBWzPF9v6eeWzQ80dQApBZBSACkFkFIAbdz9fBza6H+ANg4gpQBSCiClAFIKIKUAUgogpQBSCiClAFIKoJ12ul2HBhBAAAEEEEAAAbTHAAIIIIAAAmjSAAIIIIAAAmjSAAIIIIAAAmjSAAIIIIAAAmjV4fIYGkAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQP8FJH0HkFIAKQWQUgApBZBSHwWDNS8DL1+0AAAAAElFTkSuQmCC'},{key:'tall',mime:'image/png',base64:'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'}];
  const complexLatex = String.raw`\begin{aligned}\frac{\sum_{i=1}^{n} i^2}{\sqrt{1+x^2}} &= \left(\frac{x+1}{x-1}\right)^2 \\ \int_0^1 \frac{t^2}{1+t^4}\,dt &= \frac{\pi}{4} \\ A &= \begin{pmatrix}1&2\\3&4\end{pmatrix}\end{aligned}`;
  let crash = false, cleanup = false, enabled = true, revision = 1, calls = 0;
  let documentMode = false, documentPath = "", documentRevision = "", tableCell = [], lastPath = [], complexPath = [], definitionPath = [], callPath = [];
  const baselineCode = () => `export default function(React){return function Screen({ui,invoke,saveDocument}) {const [value,setValue]=React.useState('Ready');React.useEffect(()=>()=>{if(${cleanup})throw Error('Fixture cleanup failure');},[]);if(${crash})throw Error('Fixture screen failure');return React.createElement('section',{'data-revision':${revision},style:{display:'grid',gap:'var(--space-4)'}},React.createElement(ui.Input,{'aria-label':'Threshold',defaultValue:15}),React.createElement(ui.Button,{onClick:()=>invoke('measurements',{}).then(v=>setValue(JSON.stringify(v)))},'Load measurements'),React.createElement(ui.Button,{onClick:()=>saveDocument({name:'screen-result.md',authoring:{title:'Saved measurements',inputs:[{key:'values',blocks:[{kind:'table',label:'values',caption:[{kind:'strong',children:[{kind:'text',text:'Measured values'}]}],rows:[['Item','Value'],['Measured',[{kind:'math',value:'18'}]],['Other','24']]},{kind:'figure',imageAsset:'chart',imageAlt:'Chart',caption:'Saved chart'},{kind:'equation',latex:'E=mc^2',label:'energy'},{kind:'paragraph',content:[{kind:'text',text:'See '},{kind:'reference',role:'eq',label:'energy'}]},{kind:'equation',latex:'a^2+b^2=c^2',label:'simple'},{kind:'footnote',label:'evidence',text:'Definition after the body.'},{kind:'figure',imageAsset:'tall',imageAlt:'Delayed height',caption:'Late image'},...Array.from({length:400},(_,i)=>i===90?{kind:'equation',latex:${JSON.stringify(complexLatex)},label:'complex'}:i===110?{kind:'paragraph',content:[{kind:'text',text:'Evidence call '},{kind:'footnote',label:'evidence'}]}:({kind:'paragraph',text:'Fixed sample block '+i+' — Context makes this paragraph wrap when the comparison pane becomes narrow.'}))]}]},images:${JSON.stringify(images)},open:true}).then(v=>setValue('Saved')).catch(e=>setValue(e.message))},'Save document'),React.createElement(ui.Toolbar,null,React.createElement(ui.SummaryCard,{label:'Count',value:5,description:'Loaded measurements'}),React.createElement(ui.SummaryCard,{label:'Total',value:80})),React.createElement(ui.Chart,{title:'Measurements',data:[10,18,12,24,16].map((value,i)=>({time:'00:0'+i,value})),xKey:'time',yKey:'value'}),React.createElement(ui.DataTable,{title:'Measurements',columns:['time','value'],rows:[10,18,12,24,16].map((value,i)=>({time:'00:0'+i,value}))}),React.createElement('output',null,value));}}`;
  let interactions = false, actionPath = '';
  const code = () => documentMode ? `export default function(React){return function Screen({ui}) { const [key,setKey]=React.useState(0),[target,setTarget]=React.useState({revision:${JSON.stringify(documentRevision)},path:${JSON.stringify(complexPath)}}),[state,setState]=React.useState(),[shown,setShown]=React.useState(true),[narrow,setNarrow]=React.useState(false),[requestedPath,setPath]=React.useState(${JSON.stringify(documentPath)});return React.createElement(ui.ScreenLayout,{description:"Synthetic document comparison"},React.createElement(ui.Toolbar,null,React.createElement(ui.Button,{onClick:()=>setTarget({revision:${JSON.stringify(documentRevision)},path:${JSON.stringify(tableCell)}})},"Go to table cell"),React.createElement(ui.Button,{onClick:()=>setTarget({revision:state?.revision,path:${JSON.stringify(lastPath)}})},"Go to last block"),React.createElement(ui.Button,{onClick:()=>setTarget({revision:state?.revision,path:${JSON.stringify(complexPath)}})},"Go to complex equation"),React.createElement(ui.Button,{onClick:()=>setTarget({revision:state?.revision,path:${JSON.stringify(definitionPath)}})},"Go to endnote definition"),React.createElement(ui.Button,{onClick:()=>setTarget({revision:state?.revision,path:${JSON.stringify(callPath)}})},"Go to endnote call"),React.createElement(ui.Button,{onClick:()=>setNarrow(value=>!value)},"Toggle narrow preview"),React.createElement(ui.Button,{onClick:()=>setTarget({revision:state?.revision,path:[9999]})},"Unknown target"),React.createElement(ui.Button,{onClick:()=>setTarget({revision:"old",path:${JSON.stringify(tableCell)}})},"Use stale target"),React.createElement(ui.Button,{onClick:()=>setKey(k=>k+1)},"Read again"),React.createElement(ui.Button,{onClick:()=>setShown(s=>!s)},"Toggle preview"),React.createElement(ui.Button,{onClick:()=>setPath(${JSON.stringify(documentPath)}+".missing.md")},"Missing document"),React.createElement(ui.Button,{onClick:()=>setPath("/outside/not-open.md")},"Outside folder"),React.createElement(ui.Button,{onClick:()=>setPath(${JSON.stringify(documentPath)})},"Original document"),React.createElement("output",null,state?.state)),React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:"var(--space-4)"}},React.createElement("section",{style:{flex:"1 1 320px",minWidth:0}},React.createElement("h2",null,"Source material"),React.createElement("p",null,"Synthetic source for comparison. Source display is owned by the plugin.")),shown&&React.createElement("div",{style:{flex:narrow?"0 1 260px":"1 1 320px",minWidth:0}},React.createElement(ui.DocumentView,{path:requestedPath,reloadKey:key,target,onStateChange:setState,height:480}))));}}` : !interactions ? baselineCode() : `export default function(React){return function Screen({ui,pickPath,openDocument,saveDocument}) {
    const [path,setPath]=React.useState(${JSON.stringify(actionPath)}),[result,setResult]=React.useState('Ready');
    const firstSave=React.useRef(saveDocument);const run=promise=>promise.then(value=>setResult(JSON.stringify(value))).catch(error=>setResult(error.name+': '+error.message));
    return React.createElement(ui.ScreenLayout,{description:'Select a source or destination inside the opened folders.'},
      React.createElement(ui.Input,{'aria-label':'Action path',value:path,onChange:e=>setPath(e.target.value)}),
      React.createElement(ui.Toolbar,null,...['pdf','folder','document'].map(kind=>React.createElement(ui.Button,{key:kind,onClick:()=>run(pickPath({kind}))},'Pick '+kind)),
        React.createElement(ui.Button,{onClick:()=>run(pickPath({kind:'folder',initialPath:path}))},'Pick initial'),
        React.createElement(ui.Button,{onClick:()=>run(openDocument({path}))},'Open existing'),
        React.createElement(ui.Button,{onClick:()=>run(firstSave.current({name:'screen-child.md',folder:path,authoring:{title:'Child result',inputs:[{key:'child',blocks:[{kind:'paragraph',text:'Created in a selected subfolder.'}]}]},open:true}))},'Save child')),
      React.createElement('output',null,result));}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({json:{screens:enabled ? [{plugin:'fixture.code',id:'main',entry:'screen.jsx',title:'Measurements',icon:'ChartColumn',primary:true,code:code(),codeRevision:String(revision)}] : [],receipt:{outcome:'success'}}}));
  await page.route('**/api/plugins', route => {
    if(route.request().method()!=='POST')return route.continue();
    const body=route.request().postDataJSON(); expect(body.action).toBe('screen-invoke');expect(body.plugin).toBe('fixture.code');expect(body.operation).toBe('fixture.code.measurements');calls++;
    return route.fulfill({json:{result:{points:[10,18,24]},receipt:{outcome:'success'}}});
  });
  await page.reload();await page.setViewportSize({width:1440,height:1000});
  const initial=await (await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close'}})).json();const root=initial.allowedRoots[0];
  await openPath(page,[root,'fixture','a.md'].join(root.includes('\\')?'\\':'/'));
  await page.locator('.tiptap:visible').click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(' unsaved-screen-fixture');
  await page.locator('.sidebar').getByRole('button',{name:'Measurements',exact:true}).click();
  const workspace=page.getByTestId('view-workspace').filter({visible:true});
  await workspace.getByRole('button',{name:'Load measurements'}).click();await expect(workspace.locator('output')).toHaveText('{"points":[10,18,24]}');expect(calls).toBe(1);
  await expect(workspace.locator('[data-slot="input"]')).toBeVisible();
  const creation = page.waitForResponse(response=>response.url().endsWith('/api/document')&&response.request().method()==='PUT'&&response.status()===201);
  await workspace.getByRole('button',{name:'Save document',exact:true}).click();
  const createdResponse=await creation;
  const creationInput=createdResponse.request().postDataJSON();
  documentPath=(await createdResponse.json()).path;
  await expect(page.locator('.tiptap:visible')).toContainText('18');
  await expect(page.locator('.tiptap:visible')).toContainText('24');
  await expect(page.locator('.tiptap:visible strong')).toContainText('Measured values');
  const figure = page.locator('.tiptap:visible figure').filter({hasText:'Saved chart'});
  await expect(figure).toBeVisible();
  await expect.poll(()=>figure.locator('img').evaluate(image=>image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('.sidebar').getByRole('button',{name:'Measurements',exact:true}).click();
  await workspace.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(workspace.locator('output')).toContainText('file already exists');
  // A separately saved copy has a fresh document-scoped image URL: the ordinary tab
  // must not supply an already decoded tall image to the delayed-loading regression.
  const origin=page.url().split('/').slice(0,3).join('/');
  const copy=await page.request.put(origin+'/api/document',{headers:{Connection:'close',Origin:origin},data:{...creationInput,path:documentPath.replace(/\.md$/,'-preview.md')}});
  expect(copy.status()).toBe(201);documentPath=(await copy.json()).path;
  const inspected = pluginFixture.cli(['inspect',documentPath]);
  // These are the CLI's actual Core NodePaths, passed to the plugin unchanged.
  tableCell = inspected.nodes.find(node=>node.type==='cell'&&node.text==='18').path;
  const response = await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document?path='+encodeURIComponent(documentPath),{headers:{Connection:'close'}});
  const saved = await response.json(); documentRevision=saved.revision;
  expect(inspected.revision).toBe(saved.revision);
  lastPath = inspected.nodes.filter(node=>node.type==='paragraph').at(-1).path;
  complexPath=inspected.nodes.find(node=>node.type==='equation'&&node.label==='complex').path;
  definitionPath=inspected.nodes.find(node=>node.type==='footnote'&&node.label==='evidence').path;
  callPath=inspected.nodes.find(node=>node.type==='paragraph'&&node.text.startsWith('Evidence call')).path;
  const tallName=saved.document.blocks.find(block=>block.block==='figure'&&block.imageAlt==='Delayed height').imageUrl.split('/').at(-1);
  let releaseTall, tallArrived;const tallGate=new Promise(resolve=>{releaseTall=resolve;});const tallRequested=new Promise(resolve=>{tallArrived=resolve;});
  const delayTall=async route=>{tallArrived();await tallGate;await route.continue().catch(()=>{});};
  await page.route('**/*'+tallName+'*',delayTall);
  const viewStarted=Date.now();
  // Native anchoring can conceal a one-shot navigation bug. The component must
  // also follow late layout when its embedding/browser does not anchor scrolling.
  await page.addStyleTag({content:'.screen-document-view-scroll {overflow-anchor:none}'});
  documentMode=true;revision++;
  const preview = workspace.getByRole('region',{name:'Document preview content',exact:true});
  await expect(preview).toContainText('Fixed sample block 399');
  const viewLoadMs=Date.now()-viewStarted;
  await expect(preview.locator('table')).toContainText('18');
  await expect(preview.getByTestId('equation-preview').first().locator('.katex')).toBeVisible();
  await expect(preview.getByTestId('cross-reference')).toContainText('(1)');
  await expect.poll(()=>preview.locator('figure img').first().evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(preview.locator('[contenteditable="true"]')).toHaveCount(0);
  await preview.focus();await page.keyboard.press('Control+s');
  const highlight=workspace.getByTestId('document-view-highlight');
  const inViewport=()=>highlight.evaluate(node=>{const view=node.closest('.screen-document-view-scroll'),r=node.getBoundingClientRect(),v=view.getBoundingClientRect();return r.top>=v.top&&r.top+Math.min(r.height,view.clientHeight-32)<=v.bottom;});
  let initialHighlightMs, afterImageMs, initialTop;
  try {
    await tallRequested;await expect(highlight).toBeVisible();await expect.poll(inViewport).toBe(true);
    initialHighlightMs=Date.now()-viewStarted;initialTop=await highlight.evaluate(node=>node.offsetTop);
    const released=Date.now();releaseTall();
    await expect.poll(()=>preview.locator('img[alt="Delayed height"]').evaluate(image=>image.complete&&image.naturalHeight===960)).toBe(true);
    await expect.poll(()=>highlight.evaluate(node=>node.offsetTop)).toBeGreaterThan(initialTop+480);
    await expect.poll(inViewport).toBe(true);afterImageMs=Date.now()-released;
  } finally {releaseTall();await page.unroute('**/*'+tallName+'*',delayTall);}
  const wideTargetTop=await highlight.evaluate(node=>node.offsetTop);
  await workspace.getByRole('button',{name:'Toggle narrow preview',exact:true}).click();
  await expect.poll(()=>preview.evaluate(node=>node.clientWidth)).toBeLessThanOrEqual(260);
  await expect.poll(()=>highlight.evaluate(node=>node.offsetTop)).toBeGreaterThan(wideTargetTop+480);await expect.poll(inViewport).toBe(true);
  const narrowTargetTop=await highlight.evaluate(node=>node.offsetTop);
  await workspace.getByRole('button',{name:'Toggle narrow preview',exact:true}).click();
  await expect.poll(()=>highlight.evaluate(node=>node.offsetTop)).toBeLessThan(narrowTargetTop-480);await expect.poll(inViewport).toBe(true);
  await workspace.getByRole('button',{name:'Go to endnote definition',exact:true}).click();await expect.poll(inViewport).toBe(true);
  const definition=preview.getByTestId('footnote-definition');
  await expect.poll(()=>highlight.evaluate(node=>Math.abs(node.getBoundingClientRect().top-node.closest('.screen-document-view').querySelector('[data-footnote-definition]').getBoundingClientRect().top))).toBeLessThan(2);
  const oldDefinitionTop=await highlight.evaluate(node=>node.offsetTop);
  const lateMathStyle=await page.addStyleTag({content:'.screen-document-view .katex {font-size:200%}'});
  await expect.poll(()=>highlight.evaluate(node=>node.offsetTop)).toBeGreaterThan(oldDefinitionTop);await expect.poll(inViewport).toBe(true);
  await workspace.getByRole('button',{name:'Go to endnote call',exact:true}).click();await expect.poll(inViewport).toBe(true);
  await expect.poll(()=>highlight.evaluate(node=>Math.abs(node.getBoundingClientRect().top-[...node.closest('.screen-document-view').querySelectorAll('p')].find(p=>p.textContent.startsWith('Evidence call')).getBoundingClientRect().top))).toBeLessThan(2);
  await workspace.getByRole('button',{name:'Go to complex equation',exact:true}).click();await expect.poll(inViewport).toBe(true);
  await preview.hover();await page.mouse.wheel(0,-1600);
  const belowViewport=()=>highlight.evaluate(node=>node.getBoundingClientRect().top-node.closest('.screen-document-view-scroll').getBoundingClientRect().bottom);
  await expect.poll(belowViewport).toBeGreaterThan(0);
  await workspace.getByRole('button',{name:'Toggle narrow preview',exact:true}).click();
  await expect.poll(()=>preview.evaluate(node=>node.clientWidth)).toBeLessThanOrEqual(260);await expect.poll(belowViewport).toBeGreaterThan(0);
  await lateMathStyle.evaluate(node=>node.remove());
  await workspace.getByRole('button',{name:'Toggle narrow preview',exact:true}).click();
  await workspace.getByRole('button',{name:'Go to table cell',exact:true}).click();
  await expect(workspace.getByTestId('document-view-highlight')).toBeVisible();
  await expect(highlight).toHaveAttribute('data-target-kind','cell');
  await expect.poll(()=>highlight.evaluate(node=>{const a=node.getBoundingClientRect(),b=node.closest('.screen-document-view').querySelector('table').rows[1].cells[1].getBoundingClientRect();return Math.max(...['top','left','width','height'].map(key=>Math.abs(a[key]-b[key])));})).toBeLessThan(2);
  for(const width of [1440,640]) {
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>preview.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    if(screenshots) await page.screenshot({path:`tmp/document-view-${width}-light.png`,mask:[page.locator('.sidebar')],maskColor:await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).backgroundColor)});
  }
  await page.setViewportSize({width:1440,height:1000});
  const lightPaper=await preview.evaluate(node=>getComputedStyle(node).backgroundColor);
  await page.locator('.sidebar').getByRole('button',{name:'Color mode: Light',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect.poll(()=>preview.evaluate(node=>getComputedStyle(node).backgroundColor)).not.toBe(lightPaper);
  if(screenshots) await page.screenshot({path:'tmp/document-view-1440-dark.png',mask:[page.locator('.sidebar')],maskColor:await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).backgroundColor)});
  await page.setViewportSize({width:640,height:1000});await expect.poll(inViewport).toBe(true);
  if(screenshots) await page.screenshot({path:'tmp/document-view-640-dark.png',mask:[page.locator('.sidebar')],maskColor:await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).backgroundColor)});
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.sidebar').getByRole('button',{name:'Color mode: Dark',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await workspace.getByRole('button',{name:'Go to complex equation',exact:true}).click();await expect.poll(inViewport).toBe(true);
  const rereadStarted=Date.now();
  const reread=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('/api/document?')&&decodeURIComponent(response.url()).includes(documentPath));
  await workspace.getByRole('button',{name:'Read again',exact:true}).click();await reread;
  await expect(preview).toContainText('Fixed sample block 399');await expect.poll(inViewport).toBe(true);
  const normalNavigationMs=Date.now()-rereadStarted;
  await workspace.getByRole('button',{name:'Go to last block',exact:true}).click();
  await expect.poll(()=>preview.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  const scrollBeforeStale=await preview.evaluate(node=>node.scrollTop);
  await workspace.getByRole('button',{name:'Use stale target',exact:true}).click();
  await expect(workspace.locator('output')).toHaveText('stale-target');
  expect(await preview.evaluate(node=>node.scrollTop)).toBe(scrollBeforeStale);
  await expect(workspace.getByTestId('document-view-highlight')).toHaveCount(0);
  await workspace.getByRole('button',{name:'Unknown target',exact:true}).click();
  await expect(workspace.locator('output')).toHaveText('target-not-found');
  await expect(workspace.getByTestId('document-view-highlight')).toHaveCount(0);
  const paragraph = saved.document.blocks.find(block=>block.block==='paragraph');
  const changed = await page.request.post(page.url().split('/').slice(0,3).join('/')+'/api/document',{headers:{Connection:'close',Origin:page.url().split('/').slice(0,3).join('/')},data:{path:documentPath,revision:saved.revision,base:{source:saved.source},paragraphs:[{path:paragraph.path,content:[{kind:'text',text:'Externally changed sample'}]}]}});
  expect(changed.ok(),await changed.text()).toBe(true);
  await expect(preview).not.toContainText('Externally changed sample');
  await workspace.getByRole('button',{name:'Read again',exact:true}).click();
  await expect(preview).toContainText('Externally changed sample');
  await workspace.getByRole('button',{name:'Go to last block',exact:true}).click();
  await expect(workspace.locator('output')).toHaveText('ready');
  await workspace.getByRole('button',{name:'Go to table cell',exact:true}).click();
  await expect(workspace.locator('output')).toHaveText('stale-target');
  await workspace.getByRole('button',{name:'Toggle preview',exact:true}).click();
  await expect(preview).toHaveCount(0);
  await page.evaluate(()=>{window.__documentReadAborted=false;window.__originalDocumentFetch=window.fetch;window.fetch=(input,init)=>{if(String(input).includes('/api/document?'))init?.signal?.addEventListener('abort',()=>window.__documentReadAborted=true);return window.__originalDocumentFetch(input,init);};});
  let requested; const started = new Promise(resolve=>requested=resolve);
  let release; const held = new Promise(resolve=>release=resolve);
  const slow = async route=>{requested();await held;await route.abort().catch(()=>{});};
  await page.route('**/api/document?path=*',slow);
  await workspace.getByRole('button',{name:'Toggle preview',exact:true}).click();await started;
  await workspace.getByRole('button',{name:'Toggle preview',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__documentReadAborted)).toBe(true);
  await page.evaluate(()=>{window.fetch=window.__originalDocumentFetch;});
  release();await page.unroute('**/api/document?path=*',slow);
  await expect(workspace.locator('output')).toHaveText('loading');
  await workspace.getByRole('button',{name:'Toggle preview',exact:true}).click();
  await expect(preview).toContainText('Externally changed sample');
  await workspace.getByRole('button',{name:'Missing document',exact:true}).click();
  await expect(workspace.locator('output')).toHaveText('error');
  await expect(workspace.locator('.screen-document-view [role="alert"]')).toBeVisible();
  await workspace.getByRole('button',{name:'Outside folder',exact:true}).click();
  await expect(workspace.locator('.screen-document-view')).toContainText("inside this screen's opened folders");
  await expect(preview).toHaveCount(0);
  documentMode=false;revision++;
  await expect(workspace.getByRole('button',{name:'Load measurements',exact:true})).toBeVisible();


  if(screenshots) await page.screenshot({path:'tmp/screen-code-light.png',mask:[page.locator('.sidebar-host-account'),page.locator('.sidebar-folder-header')]});
  await page.locator('.sidebar').getByRole('button',{name:'Color mode: Light',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await workspace.getByRole('button',{name:'Load measurements'}).click();await expect(workspace.locator('output')).toContainText('points');
  if(screenshots) await page.screenshot({path:'tmp/screen-code-dark.png',mask:[page.locator('.sidebar-host-account'),page.locator('.sidebar-folder-header')]});
  // Keep the two interaction fixtures' held-request variables in separate scopes.
  {
  const inRoot=(...parts)=>[root,...parts].join(root.includes('\\')?'\\':'/');
  const childFolder=inRoot('fixture','output');
  const madeFolder=await page.request.post(page.url().split('/').slice(0,3).join('/')+'/api/folder',{headers:{Connection:'close',Origin:page.url().split('/').slice(0,3).join('/')},data:{parent:inRoot('fixture'),name:'output'}});expect(madeFolder.ok()).toBe(true);
  interactions=true;actionPath=inRoot('fixture','a.md');revision++;
  await expect(workspace.getByRole('button',{name:'Pick pdf',exact:true})).toBeVisible();
  const output=workspace.locator('output'), field=workspace.getByRole('textbox',{name:'Action path'});
  const dialog=page.getByRole('dialog');
  await workspace.getByRole('button',{name:'Pick pdf',exact:true}).click();
  await expect(dialog).toHaveAccessibleName('Choose PDF');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(output).toHaveText('null');
  await page.route('**/api/folder-browse?*',route=>route.fulfill({status:503,json:{error:'Fixture selection read failed'}}),{times:1});
  await workspace.getByRole('button',{name:'Pick folder',exact:true}).click();
  await expect(output).toContainText('Error: Fixture selection read failed');await expect(dialog).toHaveCount(0);
  await workspace.getByRole('button',{name:'Pick pdf',exact:true}).click();
  await dialog.getByTestId('folder-path').fill([root,'fixture'].join(root.includes('\\')?'\\':'/')+'/');
  await dialog.getByRole('option',{name:'reading.pdf',exact:true}).click();
  await dialog.getByTestId('folder-open').click();await expect(output).toContainText('"kind":"pdf"');
  await workspace.getByRole('button',{name:'Pick document',exact:true}).click();
  await dialog.getByTestId('folder-path').fill(actionPath);
  await expect(dialog.getByRole('option',{name:'a.md',exact:true})).toBeVisible();
  await dialog.getByTestId('folder-open').click();await expect(output).toContainText('"kind":"document"');
  await workspace.getByRole('button',{name:'Open existing',exact:true}).click();
  await page.getByRole('tab',{name:'a.md, Unsaved changes',exact:true}).click();
  await expect(page.locator('.tiptap:visible')).toContainText('unsaved-screen-fixture');
  await page.locator('.sidebar').getByRole('button',{name:'Measurements',exact:true}).click();
  await expect(output).toContainText('"status":"opened"');
  await field.fill(root+'/../outside.md');await workspace.getByRole('button',{name:'Open existing',exact:true}).click();await expect(output).toContainText('"status":"refused"');
  await workspace.getByRole('button',{name:'Pick initial',exact:true}).click();await expect(output).toContainText('inside this screen');await expect(dialog).toHaveCount(0);
  await field.fill(childFolder);
  await workspace.getByRole('button',{name:'Pick initial',exact:true}).click();await expect(dialog).toHaveAccessibleName('Choose folder');
  await expect(dialog.getByTestId('folder-open')).toBeEnabled();
  for (const width of [1440,640]) {
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
    if(screenshots)await page.screenshot({path:'tmp/screen-pick-'+width+'.png',maskColor:await page.locator('.sidebar').evaluate(node=>getComputedStyle(node).backgroundColor),mask:[page.locator('.sidebar-host-account'),page.locator('.sidebar-folder-header'),field,dialog.getByTestId('folder-path'),output]});
  }
  await dialog.getByTestId('folder-open').click();await expect(output).toContainText('"kind":"folder"');
  await page.setViewportSize({width:1440,height:1000});
  // A successful creation keeps its receipt when the subsequent root/open preflight fails.
  await page.route('**/api/folder?root=*',route=>route.fulfill({status:403,json:{error:'Fixture opening refused'}}),{times:1});
  let creations=0;const countCreate=request=>{if(request.method()==='PUT'&&request.url().split('?')[0].endsWith('/api/document'))creations++;};page.on('request',countCreate);
  await workspace.getByRole('button',{name:'Save child',exact:true}).click();
  await expect(output).toContainText('"opening":{"status":"refused"');await expect(output).toContainText('"revision":');expect(creations).toBe(1);page.off('request',countCreate);
  await field.fill(inRoot('fixture','output','screen-child.md'));await workspace.getByRole('button',{name:'Open existing',exact:true}).click();
  await expect(page.locator('.tiptap:visible')).toContainText('Created in a selected subfolder.');
  await page.locator('.sidebar').getByRole('button',{name:'Measurements',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'More actions',exact:true}).first().click();
  await page.getByRole('menuitem',{name:'Close folder',exact:true}).click();
  await workspace.getByRole('button',{name:'Open existing',exact:true}).click();await expect(output).toContainText('"status":"refused"');
  await workspace.getByRole('button',{name:'Save child',exact:true}).click();await expect(output).toContainText('Open a folder');
  await workspace.getByRole('button',{name:'Pick initial',exact:true}).click();await expect(output).toContainText('inside this screen');
  await openPath(page,actionPath);await page.locator('.sidebar').getByRole('button',{name:'Measurements',exact:true}).click();
  await workspace.getByRole('button',{name:'Pick folder',exact:true}).click();await expect(dialog).toBeVisible();
  revision++;await expect(dialog).toHaveCount(0);await expect(output).toHaveText('Ready');
  let held;let releaseRead;const readReleased=new Promise(resolve=>{releaseRead=resolve;});
  await page.evaluate(()=>{const previous=window.fetch;window.__pickerAborted=false;window.fetch=(url,options)=>{
    if(String(url).includes('/api/folder-browse'))options?.signal?.addEventListener('abort',()=>{window.__pickerAborted=true;},{once:true});return previous(url,options);
  };});
  await page.route('**/api/folder-browse?*',async route=>{held=route;await readReleased;await route.fulfill({json:{path:root,crumbs:[],entries:[]}});},{times:1});
  await workspace.getByRole('button',{name:'Pick folder',exact:true}).click();await expect(dialog).toBeVisible();
  await expect.poll(()=>Boolean(held)).toBe(true);
  enabled=false;await expect(dialog).toHaveCount(0);await expect(workspace.getByText('Unavailable',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__pickerAborted)).toBe(true);releaseRead();
  enabled=true;interactions=false;revision++;await expect(workspace.getByRole('button',{name:'Load measurements'})).toBeVisible();
  }
  crash=true;revision++;
  await expect(workspace).toContainText('Fixture screen failure');
  enabled=false; await expect(workspace.getByText('Unavailable',{exact:true})).toBeVisible();
  enabled=true;crash=false;revision++;await expect(workspace.getByRole('button',{name:'Load measurements'})).toBeVisible();
  cleanup=true;revision++;await expect(workspace.locator('section[data-revision]')).toHaveAttribute('data-revision',String(revision));
  enabled=false;await expect(workspace).toContainText('Fixture cleanup failure');
  enabled=true;cleanup=false;revision++;await expect(workspace.getByRole('button',{name:'Load measurements'})).toBeVisible();
  cleanup=true;revision++;await expect(workspace.locator('section[data-revision]')).toHaveAttribute('data-revision',String(revision));
  revision++;await expect(workspace).toContainText('Fixture cleanup failure');
  cleanup=false;revision++;await expect(workspace.getByRole('button',{name:'Load measurements'})).toBeVisible();
  cleanup=true;revision++;await expect(workspace.locator('section[data-revision]')).toHaveAttribute('data-revision',String(revision));
  await page.getByRole('button',{name:'Close Measurements',exact:true}).click();

  await page.getByRole('tab',{name:'a.md, Unsaved changes',exact:true}).click();await expect(page.locator('.tiptap:visible')).toContainText('unsaved-screen-fixture');await page.locator('.tiptap:visible').click();await page.keyboard.insertText(' still editable');await expect(page.locator('.tiptap:visible')).toContainText('still editable');
  return {sampleBlocks:saved.document.blocks.length,viewLoadMs,initialHighlightMs,afterImageMs,normalNavigationMs,includesRevisionPolling:true};
}
