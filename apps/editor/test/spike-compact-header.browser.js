// Spike #2016 only: capture the current task header and three compact drafts with synthetic plugin screens.
// pnpm browser:test spike-compact-header --screenshots
async (page, { expect, openPath }) => {
  const OUT = 'docs/spikes/assets/2016-compact-task-header';
  const origin = page.url().split('/').slice(0, 3).join('/');
  const initial = await (await page.request.get(origin + '/api/document', { headers: { Connection: 'close' } })).json();
  const root = initial.allowedRoots[0];
  const sep = root.includes('\\') ? '\\' : '/';
  const documentPath = [root, 'spike-2016', 'inspection.md'].join(sep);
  const compareCode = `export default function(React){return function Screen({ui}){
    const [page,setPage]=React.useState(1);
    const boxes=Array.from({length:9},(_,i)=>React.createElement('div',{key:i,style:{height:i%3===0?28:64,margin:'var(--space-3) var(--space-4)',borderInlineStart:'var(--space-1) solid var('+(i%3===1?'--id-color-warning':'--id-color-info')+')',background:'var(--id-color-surface-muted, rgba(127,127,127,.08))'}}));
    return React.createElement(ui.ScreenLayout,{fillHeight:true,
      back:{label:'변환한 문서',onBack:()=>{}},
      meta:'설비 점검 절차서.pdf · 42쪽',
      description:'원본 PDF와 변환한 문서를 나란히 놓고 빠지거나 바뀐 내용을 확인합니다.',
      status:React.createElement(ui.Status,{tone:'warning',label:'검토 중'}),
      actions:React.createElement(React.Fragment,null,React.createElement(ui.Button,null,'문서 열기'),React.createElement(ui.Button,{variant:'default'},'검토 완료'))},
      React.createElement(ui.Toolbar,{label:'대조 도구'},React.createElement(ui.Button,{onClick:()=>setPage(p=>Math.max(1,p-1))},'이전 쪽'),React.createElement(ui.Button,{onClick:()=>setPage(p=>p+1)},'다음 쪽'),React.createElement(ui.Button,null,'다음 차이'),React.createElement('span',{className:'type-helper'},page+' / 42쪽')),
      React.createElement('div',{'data-spike-content':'',style:{display:'flex',flex:1,minHeight:0,gap:'var(--space-4)'}},
        React.createElement('section',{'aria-label':'원본 자료',style:{flex:'1 1 0',minWidth:0,overflow:'auto',border:'var(--border-width) solid var(--id-color-border-subtle)',borderRadius:'var(--id-radius-md)'}},boxes),
        React.createElement('div',{style:{flex:'1 1 0',minWidth:0,display:'flex',flexDirection:'column'}},React.createElement(ui.DocumentView,{path:${JSON.stringify(documentPath)},height:'fill'}))));}}`;
  const NAMES = ['측정 기록 교환 규격', '설비 점검 절차서', '시험 장비 교정 기준', '부품 납품 검사 지침', '제어기 통신 규약 해설', '현장 안전 작업 수칙', '전원 장치 시험 계획서', '소프트웨어 형상 관리 절차'];
  const listCode = `export default function(React){return function Screen({ui}){
    const [group,setGroup]=React.useState('status');
    const states=[['review','warning','검토 중'],['draft','neutral','초안'],['done','ok','검토 완료']];
    const items=Array.from({length:16},(_,i)=>{const s=states[i%3];return {id:'d'+i,label:${JSON.stringify(NAMES)}[i%8]+(i<8?'':' 2판'),status:{tone:s[1],label:s[2]},group:s[0],details:[(12+i*7%90)+'쪽',i%4?'변환 경고 '+(i%4)+'개':null,'11월 '+(1+i)+'일']};});
    return React.createElement(ui.ScreenLayout,{
      meta:'16개 문서',
      description:'가져온 PDF와 변환한 문서를 상태별로 모아 보고 이어서 검토합니다.',
      status:React.createElement(ui.Status,{tone:'ok',label:'변환 서비스 연결됨'}),
      actions:React.createElement(ui.Button,{variant:'default'},'PDF 가져오기')},
      React.createElement(ui.Toolbar,{label:'목록 도구'},React.createElement(ui.Select,{hideLabel:true,label:'묶기',value:group,onValueChange:setGroup,options:[{value:'status',label:'상태별로 묶기'},{value:'none',label:'묶지 않기'}]})),
      React.createElement('div',{'data-spike-content':''},React.createElement(ui.ItemList,{items,groups:group==='status'?[{id:'review',title:'검토 중'},{id:'draft',title:'초안'},{id:'done',title:'검토 완료'}]:undefined,hideStatusLabel:group==='status',onOpen:()=>{}})));}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({ json: { screens: [
    { plugin: 'fixture.spike', id: 'compare', entry: 'compare.jsx', title: '원본 대조', icon: 'Columns2', primary: true, code: compareCode, codeRevision: '1' },
    { plugin: 'fixture.spike-list', id: 'list', entry: 'list.jsx', title: '변환한 문서', icon: 'ListChecks', primary: true, code: listCode, codeRevision: '1' },
  ], receipt: { outcome: 'success' } } }));
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPath(page, documentPath);
  await page.evaluate(() => localStorage.setItem('litzio.uiLanguage', 'ko'));
  await page.reload();
  await page.getByTestId('activity-bar').waitFor();
  await expect(page.getByRole('tab', { name: /inspection/ })).toBeVisible();
  const bar = page.getByTestId('activity-bar');
  const theme = value => page.evaluate(value => { document.documentElement.dataset.theme = value; }, value);
  const draft = value => page.evaluate(value => { if (value === 'current') delete document.documentElement.dataset.taskHeader; else document.documentElement.dataset.taskHeader = value; }, value);
  const open = async name => {
    await bar.getByRole('button', { name, exact: true }).click();
    const surface = page.locator('.task-surface:visible').first();
    await expect(surface.locator('.task-header')).toBeVisible();
    return surface;
  };
  const measure = async (surface, kind) => surface.evaluate((node, kind) => {
    const header = node.querySelector('.task-header').getBoundingClientRect();
    const body = (node.querySelector('.screen-layout') ?? node.querySelector('.template-gallery-section') ?? node.querySelector('.task-header').nextElementSibling).getBoundingClientRect();
    const content = node.querySelector('[data-spike-content]')?.getBoundingClientRect();
    const overflow = [...node.querySelectorAll('.task-header *')].some(child => { const r = child.getBoundingClientRect(); return r.width && (r.right > header.right + 0.5 || r.left < header.left - 0.5); });
    return { kind, surfaceTop: Math.round(node.getBoundingClientRect().top), headerTop: Math.round(header.top), headerHeight: Math.round(header.height), bodyTop: Math.round(body.top), contentTop: content ? Math.round(content.top) : null, overflow };
  }, kind);
  const results = [];
  const shoot = async (variant, name, kind, file) => {
    await draft(variant);
    const surface = await open(name);
    await page.waitForTimeout(250);
    await page.mouse.move(0, 0);
    results.push({ variant, file, ...(await measure(surface, kind)) });
    await page.screenshot({ path: `${OUT}/${variant}-${file}.png` });
  };
  // Same tabs in every capture.
  for (const name of ['원본 대조', '변환한 문서', '템플릿 갤러리']) await open(name);
  for (const variant of ['current', 'a', 'b', 'c']) {
    await theme('light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await shoot(variant, '원본 대조', 'compare', 'compare-1440x900-light');
    await shoot(variant, '변환한 문서', 'list', 'list-1440x900-light');
    await shoot(variant, '템플릿 갤러리', 'gallery', 'gallery-1440x900-light');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await shoot(variant, '원본 대조', 'compare', 'compare-1920x1080-light');
    await theme('dark');
    await page.setViewportSize({ width: 640, height: 900 });
    await shoot(variant, '원본 대조', 'compare', 'compare-640x900-dark');
  }
  // Hidden text stays reachable: the description in the ⓘ tooltip and the return target on hover.
  await theme('light'); await page.setViewportSize({ width: 1440, height: 900 }); await draft('a');
  const surface = await open('원본 대조');
  await surface.locator('.task-header-info').hover();
  await expect(page.getByText('원본 PDF와 변환한 문서를', { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/a-compare-1440x900-light-description-tooltip.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });
  await draft('current');
  return results;
}
