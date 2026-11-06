import { test, expect, chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { brand } from '../../../brand.ts';

test('live interview → two node revisions → approved native report', async () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const evidence = path.join(root, 'spike-artifacts', 'visual'); mkdirSync(evidence, { recursive: true });
  const profile = path.join(tmpdir(), `${brand.appName}-browser-profile`, createHash('sha256').update(root).digest('hex').slice(0,16));
  const browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width:1440,height:1100 }, extraHTTPHeaders: { Connection: 'close' }, ignoreDefaultArgs: ['--hide-scrollbars'] });
  const page = await browser.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const snap = async (name: string) => {
    await page.screenshot({ path:path.join(evidence, `${name}-1440.png`), fullPage:true });
    await page.setViewportSize({width:640,height:1100});
    await page.screenshot({ path:path.join(evidence, `${name}-640-dark.png`), fullPage:true });
    await page.setViewportSize({width:1440,height:1100});
  };
  try {
    await page.goto('http://127.0.0.1:5196/interview.html');
    await expect(page.locator('.work')).toBeVisible({timeout:15000});
    let progress = await (await page.request.get('http://127.0.0.1:5196/spike-api/state')).json();
    if (!progress.form) {
    await page.getByRole('textbox',{name:'비서에게 메시지'}).fill('합성 사례: 한빛 연구실의 동네 도서 교환 행사 운영 보고서 만들어 줘. 주민 30명, 토요일 오후 2시간, 예산 10만원 규모야. 먼저 목적에 맞는 인터뷰 폼으로 질문해 줘.');
    await page.getByRole('button',{name:'보내기',exact:true}).click();
    await expect(page.locator('.fields textarea').first()).toBeVisible({timeout:190000});
    }
    if (!progress.graph) {
    const fields = page.locator('.fields textarea'); const count = await fields.count();
    for(let i=0;i<count;i++) await fields.nth(i).fill(`합성 계획 ${i+1}: 주민 30명이 책을 나누며 교류한다. 토요일 14~16시 한빛 도서관에서 진행한다. 예산은 10만원, 운영자 3명. 신청 접수, 책 상태 확인, 교환, 만족도 설문 순서. 불량 도서는 별도 보관하고 분실은 운영자에게 알린다. 성과는 교환 50권과 만족도 80%로 확인한다.`);
    await snap('01-interview');
    await page.getByRole('textbox',{name:'비서에게 메시지'}).fill('입력 완료');
    await page.getByRole('button',{name:'보내기',exact:true}).click();
    await expect(page.locator('.flow-stage')).toBeVisible({timeout:190000});
    // Manual motion evidence from this same genuine response, not a replayed fixture.
    for(let i=0;i<12;i++) { await page.screenshot({path:path.join(evidence, `motion-${String(i).padStart(2,'0')}.png`)}); await page.waitForTimeout(85); }
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await snap('02-flow');
    }
    const firstId = await page.locator('.react-flow__node').first().getAttribute('data-id');
    const initial = await (await page.request.get('http://127.0.0.1:5196/spike-api/state')).json();
    expect(initial.calls.at(-1).input.answers).toEqual(initial.answers);
    expect(initial.document).toBeUndefined();
    for(const [i, message] of ['이 노드에 담당자 1명과 시작 전 체크리스트 확인을 추가해 줘. 기존 목적과 순서는 유지해 줘.','같은 노드에서 책이 분실되면 운영자에게 접수하고 행사 종료 전에 확인하는 예외 처리를 추가해 줘. 앞서 정한 담당자와 체크리스트도 유지해 줘.'].entries()) {
      progress = await (await page.request.get('http://127.0.0.1:5196/spike-api/state')).json();
      if (progress.calls.filter((c:any)=>c.stage==='revise'&&c.status==='completed').length > i) continue;
      await page.locator(`.react-flow__node[data-id="${firstId}"]`).click();
      await page.getByRole('textbox',{name:'노드 의견',exact:true}).fill(message);
      await snap(`03-comment-${i+1}`);
      const before = await (await page.request.get('http://127.0.0.1:5196/spike-api/state')).json();
      await page.getByRole('button',{name:'의견 전달',exact:true}).click();
      await expect(page.locator('.waiting')).toBeHidden({timeout:190000});
      const after = await (await page.request.get('http://127.0.0.1:5196/spike-api/state')).json();
      expect(after.revision).toBe(before.revision+1); expect(after.comments.at(-1)).toMatchObject({nodeId:firstId,revision:before.revision,text:message});
      expect(after.calls.at(-1).input.graph).toEqual(before.graph); expect(after.graph.nodes.some((n:any)=>n.id===firstId)).toBe(true); expect(after.document).toBeUndefined();
    }
    await snap('04-refined');
    // Representative controls: node list keyboard route, drag/pan and zoom use OSS React Flow.
    const node = page.locator('.react-flow__node').first(); const box = await node.boundingBox();
    if(box) { await page.mouse.move(box.x+40,box.y+25); await page.mouse.down(); await page.mouse.move(box.x+75,box.y+50,{steps:8}); await page.mouse.up(); }
    await page.locator('.react-flow__controls-zoomin').click();
    await page.locator('.node-list button').first().focus(); await page.keyboard.press('Enter');
    await expect(page.locator('.node-list button').first()).toHaveAttribute('aria-pressed','true');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width:640,height:1100});
    expect(await node.evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({width:1440,height:1100});
    await page.getByRole('button',{name:'이대로 승인하고 보고서 만들기'}).click();
    await expect(page.locator('.receipt')).toBeVisible({timeout:190000});
    const final = await (await page.request.get('http://127.0.0.1:5196/spike-api/state')).json();
    expect(final.calls).toHaveLength(5); expect(final.calls.every((c:any)=>c.status==='completed'&&c.actualModel==='gpt-6-luna')).toBe(true);
    expect(final.document).toMatchObject({valid:true,canonical:true,receiptMatches:true}); expect(final.approval.revision).toBe(final.revision-1);
    await snap('05-native-report');
    expect(errors).toEqual([]);
    writeFileSync(path.join(root,'spike-artifacts','verification.json'),JSON.stringify({passed:true,calls:final.calls.map((c:any)=>({stage:c.stage,model:c.actualModel,effort:c.effort,startedAt:c.startedAt,finishedAt:c.finishedAt,tokenUsage:c.tokenUsage})),nodeId:firstId,revisions:final.revision,document: {name:final.document.name,valid:final.document.valid,canonical:final.document.canonical,receiptMatches:final.document.receiptMatches},errors},null,2));
  } finally { await browser.close(); }
});
