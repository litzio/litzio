// Activity bar overflow (#1817): items that do not fit move into More, whose searchable list runs any
// screen entry; plugin artwork is drawn in the bar's one color, an opaque picture keeps its named icon.
// Plugin screens and icons are synthetic responses. Shell toggling, keyboard order and overlay geometry
// stay in editor-shell, layout-rules and folder-navigation. Settings can hide the names (#1877).
async (page, { expect }) => {
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
  const artwork = {
    1: svg('<circle cx="12" cy="12" r="10" fill="#2f7fd1"/>'),
    2: svg('<rect width="24" height="24" fill="#ffffff"/><rect x="4" y="4" width="16" height="16" fill="#2e9b6a"/>'),
  };
  const names = ['Requirements review', 'Quality check', 'Process analysis', 'Supply documents', 'Project status report', 'References',
    'Drawing list', 'Release check', 'Meeting notes', 'Schedule', 'Glossary', 'Change history'];
  const code = title => `export default function(React){return function Screen(){return React.createElement('p',null,${JSON.stringify(`${title} screen`)});}}`;
  await page.route('**/api/plugin-screens', route => route.fulfill({json:{screens:names.map((title, i) => ({plugin:`sample.plugin-${i + 1}`, id:'main', entry:'screen.jsx', title,
    icon:i === 1 ? 'Table' : '', ...(artwork[i + 1] ? {iconDigest:`d${i + 1}`} : {}), primary:true, code:code(title), codeRevision:'1'})), receipt:{outcome:'success'}}}));
  await page.route('**/api/plugins/icon?*', route => {
    const body = artwork[Number(((/[?&]id=([^&]+)/.exec(route.request().url()) ?? [])[1] ?? '').split('-').pop())];
    return body ? route.fulfill({status:200, contentType:'image/svg+xml', body}) : route.fulfill({status:404, body:''});
  });
  try {
    await page.setViewportSize({width:1440, height:700});
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    const bar = page.getByTestId('activity-bar');
    const more = bar.getByRole('button', {name:'More', exact:true});
    await expect(more).toBeVisible();
    // Shown entries end before More, which stays above the bottom group; the rest are neither visible nor reachable.
    const layout = await bar.evaluate(node => {
      const box = element => element.getBoundingClientRect();
      const shown = [...node.querySelectorAll('.activity-bar-screens > [data-activity-item]:not([data-overflow])')];
      const hidden = [...node.querySelectorAll('.activity-bar-screens > [data-activity-item][data-overflow]')];
      const moreBox = box(node.querySelector('[data-activity-more]')), bottom = box(node.querySelector('.activity-bar-preferences'));
      return {shown:shown.length, hidden:hidden.length, beforeMore:shown.every(item => box(item).bottom <= moreBox.top),
        aboveBottom:moreBox.bottom <= bottom.top, hiddenInert:hidden.every(item => item.inert && getComputedStyle(item).visibility === 'hidden'),
        labelsClamped:[...node.querySelectorAll('.activity-bar-label')].every(label => label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().height <= 2 * parseFloat(getComputedStyle(label).lineHeight) + 0.5)};
    });
    expect(layout).toMatchObject({beforeMore:true, aboveBottom:true, hiddenInert:true, labelsClamped:true});
    expect(layout.shown + layout.hidden).toBe(names.length + 1);
    expect(layout.hidden).toBeGreaterThan(0);
    // Keyboard order skips hidden entries: More follows the last shown entry.
    await bar.getByRole('button', {name:/^(Collapse|Expand) Explorer$/}).focus();
    for (let step = 0; step < layout.shown; step++) await page.keyboard.press('ArrowDown');
    await expect(more).not.toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(more).toBeFocused();
    // One color in the bar: artwork becomes a tinted shape; an opaque picture keeps its named icon.
    const icons = await bar.evaluate(node => {
      const icon = id => node.querySelector(`[data-activity-id="${id}"] .activity-bar-icon > *`);
      const tinted = icon('screen-sample.plugin-1'), opaque = icon('screen-sample.plugin-2');
      return {tinted:tinted?.classList.contains('plugin-icon--mono') && getComputedStyle(tinted).backgroundColor === getComputedStyle(tinted.closest('button')).color,
        opaque:opaque?.tagName.toLowerCase() === 'svg' && opaque.classList.contains('lucide-table')};
    });
    expect(icons).toEqual({tinted:true, opaque:true});
    // More lists every screen entry, filters by name, and Enter runs the first match then closes.
    await page.keyboard.press('Enter');
    const search = page.getByRole('textbox', {name:'Search screens', exact:true});
    await expect(search).toBeFocused();
    const list = page.locator('.activity-more-list');
    await expect(list.getByRole('button')).toHaveCount(names.length + 1);
    await search.fill('glossary');
    await expect(list.getByRole('button')).toHaveText(['Glossary']);
    await search.fill('nothing like this');
    await expect(list).toContainText('No matching screens');
    await search.fill('change');
    await page.keyboard.press('Enter');
    await expect(search).toHaveCount(0);
    await expect(page.getByTestId('view-workspace').filter({visible:true})).toContainText('Change history screen');
    // The running entry is marked current in the list; choosing a row runs it and closes the list.
    await more.click();
    await expect(list.getByRole('button', {name:'Change history', exact:true})).toHaveAttribute('aria-current', 'page');
    await list.getByRole('button', {name:'Template gallery', exact:true}).click();
    await expect(list).toHaveCount(0);
    await expect(page.getByRole('tab', {name:'Template gallery', exact:true})).toHaveAttribute('aria-selected', 'true');
    await expect(bar.getByRole('button', {name:'Template gallery', exact:true})).toHaveAttribute('aria-current', 'page');
    // Escape closes the list and returns focus to More.
    await more.click();
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
    // A window lower than More itself still reaches it: the bar scrolls, and keyboard focus brings all of More into view.
    for (const height of [220, 210]) {
      await page.setViewportSize({width:640, height});
      await expect(bar.locator('.activity-bar-screens > [data-activity-item]:not([data-overflow])')).toHaveCount(0);
      await bar.getByRole('button', {name:/^(Collapse|Expand) Explorer$/}).focus();
      await page.keyboard.press('ArrowDown');
      await expect(more).toBeFocused();
      const reach = await more.evaluate(node => {
        const item = node.getBoundingClientRect(), group = node.closest('.activity-bar').getBoundingClientRect();
        return {top:item.top >= group.top - 0.5, bottom:item.bottom <= group.bottom + 0.5, hit:node.contains(document.elementFromPoint(item.x + item.width / 2, item.y + item.height / 2))};
      });
      expect(reach, `More is whole and on top at 640x${height}`).toEqual({top:true, bottom:true, hit:true});
    }
    // A tall window shows every entry without More.
    await page.setViewportSize({width:1440, height:1200});
    await expect(more).toHaveCount(0);
    await expect(bar.getByRole('button', {name:'Change history', exact:true})).toBeVisible();
    // Names hidden in Settings: a narrower icon-only bar keeps accessible names, shows each name as a
    // tooltip on hover and keyboard focus, fits more entries before More at once, and survives reload.
    await page.setViewportSize({width:1440, height:700});
    const barState = () => bar.evaluate(node => {
      const box = node.getBoundingClientRect(), icon = node.querySelector('[data-activity-id="explorer"] .activity-bar-icon').getBoundingClientRect();
      return {width:box.width, labels:[...node.querySelectorAll('.activity-bar-label')].filter(label => label.getClientRects().length).length,
        hidden:node.querySelectorAll('.activity-bar-screens > [data-activity-item][data-overflow]').length, iconOffset:Math.abs(icon.x + icon.width / 2 - (box.x + box.width / 2))};
    });
    const chooseLabels = async choice => {
      await bar.getByRole('button', {name:'Settings', exact:true}).click();
      await page.getByTestId('activity-labels').selectOption(choice);
      await page.getByRole('button', {name:'Close Settings', exact:true}).click();
      await page.getByTestId('settings-dialog').waitFor({state:'detached'});
    };
    await expect(more).toBeVisible();
    const named = await barState();
    await chooseLabels('hidden');
    await expect.poll(barState).toMatchObject({width:48, labels:0});
    // Measured again without a window resize: shorter items fit more entries in the same height.
    const iconOnly = await barState();
    expect(iconOnly.hidden).toBeLessThan(named.hidden);
    expect(iconOnly.iconOffset).toBeLessThanOrEqual(0.5);
    const gallery = bar.getByRole('button', {name:'Template gallery', exact:true});
    const tooltip = page.locator('[data-slot="tooltip-content"][data-open]');
    await gallery.hover();
    await expect(tooltip).toHaveText('Template gallery');
    await page.mouse.move(720, 400);
    await expect(tooltip).toHaveCount(0);
    await bar.getByRole('button', {name:/^(Collapse|Expand) Explorer$/}).focus();
    await page.keyboard.press('ArrowDown');
    await expect(gallery).toBeFocused();
    await expect(tooltip).toHaveText('Template gallery');
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({state:'attached'});
    await expect.poll(barState).toMatchObject({width:48, labels:0, hidden:iconOnly.hidden});
    await chooseLabels('shown');
    await expect.poll(barState).toEqual(named);
  } finally {
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.endsWith('.activityLabels')) localStorage.removeItem(key); document.documentElement.dataset.activityLabels = 'shown'; });
    await page.unroute('**/api/plugin-screens');
    await page.unroute('**/api/plugins/icon?*');
    await page.setViewportSize({width:1440, height:1000});
  }
}
