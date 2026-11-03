async (page, {openPath, expect}) => {
 const initial=await (await page.request.get(page.url().split('/').slice(0,3).join('/')+'/api/document')).json();
 const sep=initial.path.includes('\\')?'\\':'/';
 const file=[...initial.path.split(sep).slice(0,-4),'tmp','quiet-document','quiet-document.md'].join(sep);
 await openPath(page,file);
 for(const [width,theme] of [[1440,'light'],[640,'dark']]) {
  await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByTestId('theme').selectOption(theme);
  await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur()});
  await page.mouse.move(0,0);
  await page.screenshot({path:`docs/design/assets/settings-tab-1032/after-${width}-${theme}.png`});
  await page.getByTestId('theme').focus();
  await page.keyboard.press('Escape');
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByTestId('theme').selectOption('light');
 await page.getByRole('tab',{name:'Settings',exact:true}).click({button:'right'});
 await page.getByRole('menuitem',{name:'Open to the right',exact:true}).click();
 await page.evaluate(async()=>{await document.fonts.ready;document.activeElement?.blur()});
 await page.mouse.move(0,0);
 await page.screenshot({path:'docs/design/assets/settings-tab-1032/after-two-groups.png'});
}
