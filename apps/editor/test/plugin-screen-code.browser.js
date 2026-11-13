async (page, {expect, screenshots, openFolderPicker, openPath}) => {
  let crash = false, cleanup = false, enabled = true, revision = 1, calls = 0;
  const code = () => `export default function(React){return function Screen({ui,invoke}) {const [value,setValue]=React.useState('Ready');React.useEffect(()=>()=>{if(${cleanup})throw Error('Fixture cleanup failure');},[]);if(${crash})throw Error('Fixture screen failure');return React.createElement('section',{'data-revision':${revision},style:{display:'grid',gap:'var(--space-4)'}},React.createElement(ui.Input,{'aria-label':'Threshold',defaultValue:15}),React.createElement(ui.Button,{onClick:()=>invoke('measurements',{}).then(v=>setValue(JSON.stringify(v)))},'Load measurements'),React.createElement('output',null,value));}}`;
  await page.route('**/api/views', route => route.fulfill({json:{catalog:{operations:[]},views:[],screens:enabled ? [{plugin:'fixture.code',id:'main',entry:'screen.jsx',title:'Measurements',icon:'ChartColumn',primary:true,defaultViewIds:[],code:code(),codeRevision:String(revision)}] : [],receipt:{outcome:'success'}}}));
  await page.route('**/api/plugins', route => {
    if(route.request().method()!=='POST')return route.continue();
    const body=route.request().postDataJSON(); expect(body.operation).toBe('fixture.code.measurements');calls++;
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
