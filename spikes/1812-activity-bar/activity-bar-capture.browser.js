// SPIKE #1812 capture scenario (not a test). Copy to apps/editor/test/ and run:
//   pnpm browser:test activity-bar-capture
async (page, {expect, openPath, assistantFixture, waitForExplorerLayout}) => {
  const sep = assistantFixture.document.includes('\\') ? '\\' : '/';
  const repo = assistantFixture.document.split(sep).slice(0, -3).join(sep);
  const folder = [repo, 'tmp', 'activity-bar', '시험 폴더'].join(sep);
  const file = [folder, '검사 계획.md'].join(sep);
  const out = name => `spikes/1812-activity-bar/captures/${name}.png`;
  const plugins = [
    ['요구사항 검토', 'ClipboardCheck'], ['품질 점검', 'ShieldCheck'], ['공정 분석', 'Factory'], ['공급 문서', 'Truck'],
    ['프로젝트 보고', 'Presentation'], ['참고 자료', 'BookOpen'], ['도면 목록', 'Ruler'], ['출시 점검', 'Rocket'],
    ['회의록 정리', 'NotebookPen'], ['일정표', 'CalendarDays'], ['용어집', 'BookA'], ['변경 이력', 'History'],
  ];
  let count = 8;
  const code = title => `export default function(React){return function Screen({ui}){return React.createElement(ui.ScreenLayout,{description:'합성 플러그인 화면 (시안 캡처용)',status:React.createElement(ui.Status,{tone:'ok',label:'준비됨'})},React.createElement(ui.Section,{title:${JSON.stringify(title)}},React.createElement(ui.Row,{kind:'fact',label:'대상 문서'},'3건'),React.createElement(ui.Row,{kind:'fact',label:'마지막 확인'},'오늘 10:20')));}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({json:{screens:plugins.slice(0, count).map(([title, icon], i) => ({plugin:`sample.plugin-${i + 1}`, id:'main', entry:'screen.jsx', title, icon, primary:true, code:code(title), codeRevision:'1'})), receipt:{outcome:'success'}}}));
  await page.setViewportSize({width:1440, height:900});
  await page.reload();
  await openPath(page, file);
  // Keep only the synthetic document tab.
  const sample = page.getByRole('button', {name: 'Close technical-document.md', exact: true});
  if (await sample.count()) { await sample.click(); await expect(sample).toHaveCount(0); }
  const base = page.url().split('?')[0];
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'ko'); localStorage.setItem('litzio.theme', 'light'); });
  const measures = {};

  // Synthetic account name; hide the absolute document location from captures.
  const mask = async () => {
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('.sidebar-host-account .sidebar-tree-name')) element.textContent = '시험 계정';
      for (const element of document.querySelectorAll('[data-testid="current-file"], .document-location, .top-bar-location')) {
        element.style.visibility = 'hidden';
      }
    });
    await page.mouse.move(720, 600);
  };
  const measure = async name => {
    measures[name] = await page.evaluate(() => {
      const box = selector => { const element = [...document.querySelectorAll(selector)].find(e => e.getClientRects().length); if (!element) return null; const r = element.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}; };
      const tree = [...document.querySelectorAll('.sidebar-folder .sidebar-tree, .sidebar-tree')].find(e => e.getClientRects().length);
      const first = document.querySelector('.activity-bar .activity-bar-button');
      return {
        viewport: [innerWidth, innerHeight],
        sidebar: box('.sidebar:not(.sidebar--collapsed)') ?? box('.sidebar'),
        activityBar: box('.activity-bar'),
        firstBarIcon: first ? (r => ({y: Math.round(r.y), h: Math.round(r.height)}))(first.getBoundingClientRect()) : null,
        panelHeader: box('.sidebar .panel-header'),
        tabRow: box('.document-tab-row'),
        footer: box('.sidebar-footer'),
        treeClientHeight: tree ? tree.clientHeight : null,
        treeScrollHeight: tree ? tree.scrollHeight : null,
        documentLeft: box('.document-scroll[data-active="true"] .document') ?? box('[data-testid="view-workspace"]'),
        hiddenInMore: document.querySelector('.activity-bar [aria-label$="더 보기"]')?.getAttribute('aria-label') ?? null,
      };
    });
  };
  const shot = async (name, fullPageCheck) => { await mask(); await measure(name); await page.screenshot({path: out(name)}); };
  const go = async (variant, {width = 1440, height = 900, plugins: n = 8, theme = 'light'} = {}) => {
    count = n;
    await page.evaluate(theme => localStorage.setItem('litzio.theme', theme), theme);
    await page.setViewportSize({width, height});
    await page.goto(variant ? `${base}?activityBar=${variant}` : base);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state: 'attached'});
    await waitForExplorerLayout(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.waitForTimeout(400);
  };
  const bar = () => page.locator('.activity-bar');
  const sidebar = () => page.getByTestId('sidebar');

  // Current screen: 8 plugins, expanded sidebar.
  await go(0);
  await expect(sidebar().getByRole('button', {name: '변경 이력'})).toHaveCount(0);
  await expect(sidebar().getByRole('button', {name: '출시 점검'})).toBeVisible();
  await shot('0-current-8-plugins');
  await go(0, {width: 640, height: 420});
  await sidebar().getByRole('button', {name: '탐색기 펼치기', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('0-current-640x420-overlay');

  // Draft 1.
  await go(1);
  await expect(bar().getByRole('button', {name: '출시 점검', exact: true})).toBeVisible();
  await shot('1-1-explorer-document');
  await bar().getByRole('button', {name: '공정 분석', exact: true}).click();
  await expect(page.getByTestId('view-workspace').filter({visible: true})).toBeVisible();
  await bar().getByRole('button', {name: '탐색기', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('1-2-collapsed-plugin-tab');
  await go(1, {height: 700, plugins: 12});
  await bar().getByRole('button', {name: /더 보기$/}).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.waitForTimeout(200);
  await mask(); await measure('1-3-more-menu-12'); await page.screenshot({path: out('1-3-more-menu-12')});
  await page.keyboard.press('Escape');
  await go(1, {width: 640, height: 700});
  await bar().getByRole('button', {name: '탐색기', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('1-4-640x700-overlay');
  await go(1, {theme: 'dark'});
  await shot('1-5-explorer-document-dark');

  // Draft 2.
  await go(2, {plugins: 12});
  await shot('2-1-explorer');
  await bar().getByRole('button', {name: '작업 화면', exact: true}).click();
  await expect(sidebar().getByRole('textbox', {name: '작업 화면 검색'})).toBeVisible();
  await shot('2-2-work-screens-12');
  await go(2, {width: 640, height: 700, plugins: 12});
  await bar().getByRole('button', {name: '작업 화면', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('2-3-640x700-overlay');

  // Draft 3.
  await go(3, {plugins: 12});
  await sidebar().getByRole('button', {name: '작업 화면', exact: true}).click();
  await expect(page.getByRole('textbox', {name: '작업 화면 검색'})).toBeVisible();
  await page.waitForTimeout(200);
  await shot('3-1-expanded-popup-12');
  await page.keyboard.press('Escape');
  await sidebar().getByRole('button', {name: '탐색기 접기', exact: true}).click();
  await page.waitForTimeout(300);
  await sidebar().getByRole('button', {name: '작업 화면', exact: true}).click();
  await expect(page.getByRole('textbox', {name: '작업 화면 검색'})).toBeVisible();
  await page.waitForTimeout(200);
  await shot('3-2-rail-popup-12');
  await page.keyboard.press('Escape');
  await sidebar().getByRole('button', {name: '탐색기 펼치기', exact: true}).click();
  await go(3, {width: 640, height: 420, plugins: 12});
  await sidebar().getByRole('button', {name: '탐색기 펼치기', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('3-3-640x420-overlay');
  await go(0, {plugins: 12});
  return measures;
}
