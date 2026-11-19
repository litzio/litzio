// SPIKE #1812 follow-up capture scenario (not a test). Copy to apps/editor/test/ and run:
//   pnpm browser:test activity-bar-labels-capture
async (page, {expect, openPath, assistantFixture, waitForExplorerLayout}) => {
  const sep = assistantFixture.document.includes('\\') ? '\\' : '/';
  const repo = assistantFixture.document.split(sep).slice(0, -3).join(sep);
  const folder = [repo, 'tmp', 'activity-bar', '시험 폴더'].join(sep);
  const file = [folder, '검사 계획.md'].join(sep);
  const out = name => `spikes/1812-activity-bar-labels/captures/${name}.png`;
  // Every other plugin ships its own simple SVG (distinct shapes); the rest have no icon at all.
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
  const artwork = {
    1: svg('<circle cx="12" cy="12" r="10" fill="#2f7fd1"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    3: svg('<path d="M12 2L22 20H2z" fill="#e0882b"/><rect x="11" y="9" width="2" height="6" fill="#fff"/><rect x="11" y="16.5" width="2" height="2" fill="#fff"/>'),
    5: svg('<rect x="3" y="3" width="8" height="8" rx="1.5" fill="#2e9b6a"/><rect x="13" y="3" width="8" height="8" rx="1.5" fill="#2e9b6a" opacity=".55"/><rect x="3" y="13" width="8" height="8" rx="1.5" fill="#2e9b6a" opacity=".55"/><rect x="13" y="13" width="8" height="8" rx="1.5" fill="#2e9b6a"/>'),
    7: svg('<path d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z" fill="#d4a017"/>'),
    9: svg('<path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" fill="#8a56c9"/><circle cx="12" cy="12" r="3.5" fill="#fff"/>'),
    11: svg('<rect x="2" y="2" width="20" height="20" rx="5" fill="#d0473e"/><path d="M6 15l3.5-4 3 3L18 8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  };
  const plugins = ['요구사항 검토', '품질 점검', '공정 분석', '공급 문서', '프로젝트 보고', '참고 자료', '도면 목록', '출시 점검', '회의록 정리', '일정표', '용어집', '변경 이력'];
  let count = 8;
  const code = title => `export default function(React){return function Screen({ui}){return React.createElement(ui.ScreenLayout,{description:'합성 플러그인 화면 (시안 캡처용)',status:React.createElement(ui.Status,{tone:'ok',label:'준비됨'})},React.createElement(ui.Section,{title:${JSON.stringify(title)}},React.createElement(ui.Row,{kind:'fact',label:'대상 문서'},'3건'),React.createElement(ui.Row,{kind:'fact',label:'마지막 확인'},'오늘 10:20')));}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({json:{screens:plugins.slice(0, count).map((title, i) => ({plugin:`sample.plugin-${i + 1}`, id:'main', entry:'screen.jsx', title, icon:'', ...(artwork[i + 1] ? {iconDigest:`d${i + 1}`} : {}), primary:true, code:code(title), codeRevision:'1'})), receipt:{outcome:'success'}}}));
  await page.route('**/api/plugins/icon?*', route => {
    const id = (/[?&]id=([^&]+)/.exec(route.request().url()) ?? [])[1] ?? '';
    const body = artwork[Number(id.split('-').pop())];
    return body ? route.fulfill({status:200, contentType:'image/svg+xml', body}) : route.fulfill({status:404, body:''});
  });
  await page.setViewportSize({width:1440, height:900});
  await page.reload();
  await openPath(page, file);
  const sample = page.getByRole('button', {name: 'Close technical-document.md', exact: true});
  if (await sample.count()) { await sample.click(); await expect(sample).toHaveCount(0); }
  const base = page.url().split('?')[0];
  await page.evaluate(() => { localStorage.setItem('litzio.uiLanguage', 'ko'); localStorage.setItem('litzio.theme', 'light'); });
  const measures = {};

  const mask = async () => {
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('.sidebar-host-account .sidebar-tree-name')) element.textContent = '시험 계정';
      for (const element of document.querySelectorAll('[data-testid="current-file"], .document-location, .top-bar-location')) element.style.visibility = 'hidden';
    });
    await page.mouse.move(720, 600);
  };
  const measure = async name => {
    measures[name] = await page.evaluate(() => {
      const box = selector => { const element = [...document.querySelectorAll(selector)].find(e => e.getClientRects().length); if (!element) return null; const r = element.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}; };
      const items = [...document.querySelectorAll('.activity-bar .activity-bar-button')].filter(e => e.getClientRects().length);
      const icon = items[0]?.querySelector('.settings-entry-icon')?.getBoundingClientRect();
      return {
        viewport: [innerWidth, innerHeight],
        activityBar: box('.activity-bar'),
        sidebar: box('.sidebar:not(.sidebar--collapsed)'),
        panelHeader: box('.sidebar .panel-header'),
        tabRow: box('.document-tab-row'),
        documentArea: box('.shell-tab:not([hidden])') ?? box('.document-tab-row'),
        documentColumn: box('.document-scroll[data-active="true"] .document'),
        firstItem: items[0] ? box('.activity-bar .activity-bar-button') : null,
        firstIconCenterY: icon ? Math.round(icon.y + icon.height / 2) : null,
        items: items.map(e => { const r = e.getBoundingClientRect(); return [e.getAttribute('aria-label'), Math.round(r.y), Math.round(r.height), Math.round(r.width)]; }),
        truncatedLabels: [...document.querySelectorAll('.activity-bar-label')].filter(e => e.scrollWidth > e.clientWidth).map(e => e.textContent),
        moreLabel: document.querySelector('.activity-bar [aria-label$="더 보기"]')?.getAttribute('aria-label') ?? null,
      };
    });
  };
  const shot = async name => { await mask(); await measure(name); await page.screenshot({path: out(name)}); };
  const go = async (variant, {width = 1440, height = 900, plugins: n = 8, theme = 'light'} = {}) => {
    count = n;
    await page.evaluate(theme => localStorage.setItem('litzio.theme', theme), theme);
    await page.setViewportSize({width, height});
    await page.goto(variant ? `${base}?activityBar=${variant}` : base);
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state: 'attached'});
    await waitForExplorerLayout(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await page.waitForTimeout(500);
  };
  const bar = () => page.locator('.activity-bar');
  const openMore = async () => {
    await bar().getByRole('button', {name: /더 보기$/}).click();
    await expect(page.getByRole('textbox', {name: '작업 화면 검색'})).toBeVisible();
    await page.waitForTimeout(250);
  };

  // Reference widths: current screen and draft 1 (48px icon bar).
  for (const variant of [0, 1]) for (const width of [1440, 640]) {
    await go(variant, {width, height: 700});
    await measure(`ref-${variant || 'current'}-${width}`);
  }

  // 1L: labels under icons.
  await go('1L');
  await expect(bar().getByRole('button', {name: '출시 점검', exact: true})).toBeVisible();
  await shot('1L-a-explorer-8');
  await bar().getByRole('button', {name: '공정 분석', exact: true}).click();
  await expect(page.getByTestId('view-workspace').filter({visible: true})).toBeVisible();
  await bar().getByRole('button', {name: '탐색기', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('1L-b-collapsed-plugin-active');
  await go('1L', {height: 700, plugins: 12});
  await openMore();
  await shot('1L-c-more-list-12');
  await page.keyboard.press('Escape');
  await go('1L', {width: 640, height: 700});
  await bar().getByRole('button', {name: '탐색기', exact: true}).click();
  await page.waitForTimeout(300);
  await shot('1L-d-640x700-overlay');
  await go('1L', {theme: 'dark'});
  await shot('1L-e-explorer-8-dark');

  // 1T: 48px bar, plugin artwork or letter tiles.
  await go('1T', {plugins: 12});
  await shot('1T-a-explorer-12');
  await go('1T', {height: 700, plugins: 12});
  await openMore();
  await shot('1T-b-more-list-12');
  await page.keyboard.press('Escape');
  await go(0);
  return measures;
}
