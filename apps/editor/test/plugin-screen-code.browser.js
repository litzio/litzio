async (page, {expect, screenshots, openFolderPicker, openPath}) => {
  const images = [{key:'chart',mime:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}];
  let crash = false, cleanup = false, enabled = true, revision = 1, calls = 0;
  const code = () => `export default function(React){return function Screen({ui,invoke,saveDocument}) {const [value,setValue]=React.useState('Ready');React.useEffect(()=>()=>{if(${cleanup})throw Error('Fixture cleanup failure');},[]);if(${crash})throw Error('Fixture screen failure');return React.createElement('section',{'data-revision':${revision},style:{display:'grid',gap:'var(--space-4)'}},React.createElement(ui.Input,{'aria-label':'Threshold',defaultValue:15}),React.createElement(ui.Button,{onClick:()=>invoke('measurements',{}).then(v=>setValue(JSON.stringify(v)))},'Load measurements'),React.createElement(ui.Button,{onClick:()=>saveDocument({name:'screen-result.md',authoring:{title:'Saved measurements',inputs:[{key:'values',blocks:[{kind:'table',label:'values',caption:[{kind:'strong',children:[{kind:'text',text:'Measured values'}]}],rows:[['Value'],[[{kind:'math',value:'18'}]],['24']]},{kind:'figure',imageAsset:'chart',imageAlt:'Chart',caption:'Saved chart'}]}]},images:${JSON.stringify(images)},open:true}).then(v=>setValue('Saved')).catch(e=>setValue(e.message))},'Save document'),React.createElement(ui.Toolbar,null,React.createElement(ui.SummaryCard,{label:'Count',value:5,description:'Loaded measurements'}),React.createElement(ui.SummaryCard,{label:'Total',value:80})),React.createElement(ui.Chart,{title:'Measurements',data:[10,18,12,24,16].map((value,i)=>({time:'00:0'+i,value})),xKey:'time',yKey:'value'}),React.createElement(ui.DataTable,{title:'Measurements',columns:['time','value'],rows:[10,18,12,24,16].map((value,i)=>({time:'00:0'+i,value}))}),React.createElement('output',null,value));}}`;
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
  await workspace.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(page.locator('.tiptap:visible')).toContainText('18');
  await expect(page.locator('.tiptap:visible')).toContainText('24');
  await expect(page.locator('.tiptap:visible strong')).toContainText('Measured values');
  const figure = page.locator('.tiptap:visible figure').filter({hasText:'Saved chart'});
  await expect(figure).toBeVisible();
  await expect.poll(()=>figure.locator('img').evaluate(image=>image.complete && image.naturalWidth > 0)).toBe(true);
  await page.locator('.sidebar').getByRole('button',{name:'Measurements',exact:true}).click();
  await workspace.getByRole('button',{name:'Save document',exact:true}).click();
  await expect(workspace.locator('output')).toContainText('file already exists');

  if(screenshots) await page.screenshot({path:'tmp/screen-code-light.png',mask:[page.locator('.sidebar-host-account'),page.locator('.sidebar-folder-header')]});
  await page.locator('.sidebar').getByRole('button',{name:'Color mode: Light',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await workspace.getByRole('button',{name:'Load measurements'}).click();await expect(workspace.locator('output')).toContainText('points');
  if(screenshots) await page.screenshot({path:'tmp/screen-code-dark.png',mask:[page.locator('.sidebar-host-account'),page.locator('.sidebar-folder-header')]});
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
}
