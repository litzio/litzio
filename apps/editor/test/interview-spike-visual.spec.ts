// Manual visual replay of previously recorded REAL model output. No AI-success assertion.
import { test, expect, chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { brand } from '../../../brand.ts';
test('recorded real response visual review at 1440 and 640', async () => {
  const root=path.resolve(import.meta.dirname,'../../..');
  const saved=JSON.parse(readFileSync(path.join(root,'spike-artifacts/session.json'),'utf8'));
  const profile=path.join(tmpdir(),`${brand.appName}-browser-profile`,createHash('sha256').update(root).digest('hex').slice(0,16));
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
  try {
    for(const width of [1440,640]) {
      const page=await context.newPage(); const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
      const folder=path.join(root,'spike-artifacts/visual',`replay-${width}`); mkdirSync(folder,{recursive:true});
      let current={...saved,graph:undefined,document:undefined,comments:[],history:saved.history.slice(0,2),revision:1};
      await page.route('**/spike-api/**',route=> {
        if(route.request().method()==='POST') current={...current,graph:saved.calls.find((c:any)=>c.stage==='flow').output,revision:2};
        return route.fulfill({json:current});
      });
      await page.setViewportSize({width,height:1100}); await page.goto('http://127.0.0.1:5196/interview.html');
      await expect(page.locator('.fields textarea').first()).toBeVisible();
      await page.getByRole('button',{name:'입력 완료 · 흐름 만들기'}).click();
      await expect(page.locator('.flow-stage')).toBeVisible();
      for(let i=0;i<12;i++){await page.screenshot({path:path.join(folder,`motion-${String(i).padStart(2,'0')}.png`),fullPage:true});await page.waitForTimeout(85);}
      current=saved;
      await page.reload(); await expect(page.locator('.native-preview .tiptap')).toBeVisible({timeout:30000});
      await expect(page.locator('.native-preview')).toContainText('담당자 1명');
      await expect(page.locator('.native-preview')).toContainText('체크리스트');
      await expect(page.locator('.native-preview')).toContainText('행사 종료 전에 확인');
      await page.screenshot({path:path.join(folder,'native-tiptap.png'),fullPage:true});
      await page.emulateMedia({reducedMotion:'reduce'});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(errors).toEqual([]); await page.close();
    }
  }finally{await context.close();}
});
