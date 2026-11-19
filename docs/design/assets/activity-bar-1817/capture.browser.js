// Manual capture for the Activity bar (#1817); not a test and not in the stable list.
// Synthetic folder (Git ignores tmp/): tmp/activity-bar/시험 폴더 with 검사 계획.md, 요구사항 개요.md,
// 주간 보고.md, 참고/용어 정리.md and 회의/3차 회의.md, each a short `litzio: 1` document.
//   cp docs/design/assets/activity-bar-1817/capture.browser.js apps/editor/test/activity-bar-capture.browser.js
//   pnpm browser:test activity-bar-capture
//   rm apps/editor/test/activity-bar-capture.browser.js
// Plugin screens and icons are synthetic responses: odd plugins 1, 3 and 7 ship SVG artwork, plugin 5 an
// opaque SVG (the bar keeps its named icon), the rest named icons.
async (page, {expect, openPath, assistantFixture, waitForExplorerLayout}) => {
  const sep = assistantFixture.document.includes('\\') ? '\\' : '/';
  const repo = assistantFixture.document.split(sep).slice(0, -3).join(sep);
  const file = [repo, 'tmp', 'activity-bar', '시험 폴더', '검사 계획.md'].join(sep);
  const out = name => `docs/design/assets/activity-bar-1817/${name}.png`;
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
  const artwork = {
    1: svg('<circle cx="12" cy="12" r="10" fill="#2f7fd1"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    3: svg('<path d="M12 2L22 20H2z" fill="#e0882b"/><rect x="11" y="9" width="2" height="6" fill="#fff"/>'),
    5: svg('<rect width="24" height="24" fill="#ffffff"/><rect x="4" y="4" width="16" height="16" fill="#2e9b6a"/>'),
    7: svg('<path d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z" fill="#d4a017"/>'),
  };
  const icons = ['ChartColumn', '', 'Table', 'LayoutDashboard', 'Table', 'Folder', '', 'FileText', 'ChartColumn', 'Table', '', 'Folder'];
  const plugins = ['요구사항 검토', '품질 점검', '공정 분석', '공급 문서', '프로젝트 진행 현황 보고', '참고 자료', '도면 목록', '출시 점검', '회의록 정리', '일정표', '용어집', '변경 이력'];
  let count = 8;
  const code = title => `export default function(React){return function Screen({ui}){return React.createElement(ui.ScreenLayout,{description:'합성 플러그인 화면',status:React.createElement(ui.Status,{tone:'ok',label:'준비됨'})},React.createElement(ui.Section,{title:${JSON.stringify(title)}},React.createElement(ui.Row,{kind:'fact',label:'대상 문서'},'3건'),React.createElement(ui.Row,{kind:'fact',label:'마지막 확인'},'오늘 10:20')));}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({json:{screens:plugins.slice(0, count).map((title, i) => ({plugin:`sample.plugin-${i + 1}`, id:'main', entry:'screen.jsx', title, icon:icons[i], ...(artwork[i + 1] ? {iconDigest:`d${i + 1}`} : {}), primary:true, code:code(title), codeRevision:'1'})), receipt:{outcome:'success'}}}));
  await page.route('**/api/plugins/icon?*', route => {
    const id = (/[?&]id=([^&]+)/.exec(route.request().url()) ?? [])[1] ?? '';
    const body = artwork[Number(id.split('-').pop())];
    return body ? route.fulfill({status:200, contentType:'image/svg+xml', body}) : route.fulfill({status:404, body:''});
  });
  await page.setViewportSize({width:1440, height:900});
  await page.reload();
  await openPath(page, file);
  const sample = page.getByRole('button', {name:'Close technical-document.md', exact:true});
  if (await sample.count()) { await sample.click(); await expect(sample).toHaveCount(0); }
  const base = page.url().split('?')[0];
  await page.evaluate(() => localStorage.setItem('litzio.uiLanguage', 'ko'));
  const go = async ({width = 1440, height = 900, plugins: n = 8, theme = 'light'} = {}) => {
    count = n;
    await page.evaluate(theme => localStorage.setItem('litzio.theme', theme), theme);
    await page.setViewportSize({width, height});
    await page.goto(base);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await waitForExplorerLayout(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.evaluate(() => document.fonts.ready);
  };
  // The account name never appears: the old footer row is masked, the bar shows only the status dot.
  const shot = async name => {
    await page.mouse.move(720, 600);
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.document-scroll[data-active="true"]')?.scrollTo(0, 0); });
    await page.screenshot({path:out(name), mask:[page.locator('.sidebar-host-account .sidebar-tree-name')],
      maskColor:await page.locator('.sidebar').evaluate(node => getComputedStyle(node).backgroundColor)});
  };
  const bar = page.getByTestId('activity-bar');
  if (!await bar.count()) { await go(); await shot('before-1440-light'); return; }
  await go();
  await shot('after-1440-light');
  await go({theme:'dark'});
  await shot('after-1440-dark');
  await go();
  await bar.getByRole('button', {name:'공정 분석', exact:true}).click();
  await expect(page.getByTestId('view-workspace').filter({visible:true})).toBeVisible();
  await bar.getByRole('button', {name:'탐색기 접기', exact:true}).click();
  await shot('after-1440-collapsed-plugin');
  await bar.getByRole('button', {name:'탐색기 펼치기', exact:true}).click();
  await go({height:700, plugins:12});
  await bar.getByRole('button', {name:'더 보기', exact:true}).click();
  await expect(page.getByRole('textbox', {name:'화면 검색'})).toBeFocused();
  await page.mouse.move(720, 600);
  await page.screenshot({path:out('after-1440x700-more')});
  await page.keyboard.press('Escape');
  await go({width:640, height:700, theme:'dark'});
  await bar.getByRole('button', {name:'탐색기 펼치기', exact:true}).click();
  await page.locator('.sidebar--overlay').waitFor();
  await page.mouse.move(400, 600);
  await page.screenshot({path:out('after-640-dark-overlay')});
  await page.evaluate(() => { localStorage.setItem('litzio.theme', 'light'); localStorage.setItem('litzio.uiLanguage', 'en'); });
}
