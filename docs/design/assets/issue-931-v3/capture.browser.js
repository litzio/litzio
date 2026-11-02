async (page,{expect})=>{
 const base='http://127.0.0.1:5391/docs/design/assets/issue-931-v3/';
 const scenes=[['01-qa','qa',1440],['02-running','running',1440],['03-created','created',1440],['04-history','history',1440],['05-model','model',1440],['06-dark','qa',1440,'dark'],['07-overlay','qa',640],['09-settings','settings',1440],['09-models','settings-models',1440],['09-diagnostics','settings-diagnostics',1440],['10-future','settings-future',1440]];
 const result=[];
 for(const [name,view,width,theme] of scenes){
  await page.setViewportSize({width,height:1000});
  await page.goto(base+'index.html?view='+view+'&theme='+(theme||'light'));
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('body')).toBeVisible();
  const geometry=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,font:document.fonts.check('14px "Pretendard Variable"'),panels:[...document.querySelectorAll('.chat,.composer,.settingscontent')].map(x=>({name:x.className,height:x.clientHeight,scrollHeight:x.scrollHeight,bottom:x.getBoundingClientRect().bottom}))}));
  expect(geometry.overflow).toBe(false);expect(geometry.font).toBe(true);
  result.push({name,...geometry});
  if(name==='01-qa'){
   await page.locator('.context-ring').hover();
   await expect(page.getByRole('tooltip')).toBeVisible();
  }
  await page.screenshot({path:'docs/design/assets/issue-931-v3/'+name+'.png'});
  if(name==='09-settings'){
   await page.getByRole('button',{name:'Codex 모델 보기',exact:true}).first().click();
   await expect(page.getByRole('dialog',{name:'Codex 모델'})).toBeVisible();
   await page.getByRole('textbox',{name:'모델 검색'}).fill('luna');
   await expect(page.locator('.discovered-model:visible')).toHaveCount(1);
   await page.getByRole('button',{name:'▤ 진단',exact:true}).click();
   await expect(page.getByRole('heading',{name:'Codex 진단'})).toBeVisible();
  }
 }
 await page.setViewportSize({width:1600,height:1000});
 await page.goto(base+'index.html?view=overview');
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>Promise.all([...document.images].map(x=>x.decode())));
 await page.screenshot({path:'docs/design/assets/issue-931-v3/00-overview.png',fullPage:true});
 return {version:'v3.1',unchanged:['07-closed.png','08-setup.png'],screens:result};
}
