const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const fixture = require('./fixture.cjs');
function setup(view = 'week', html = fixture.body(view)) {
  const dom = new JSDOM(html, {runScripts:'outside-only', url:`https://calendar.google.com/calendar/u/0/r/${view}`});
  const w = dom.window;
  w.HTMLElement.prototype.getClientRects = function() { return this.style.display === 'none' ? [] : [{width:100,height:20}]; };
  w.TextDecoder = TextDecoder;
  for (const name of ['core', 'adapter']) w.eval(fs.readFileSync(`extension/${name}.js`, 'utf8'));
  return dom;
}
for (const view of ['month','week','day']) test(`${view}: 重複をまとめ、未コピーを残し、無効化で完全に復元`, () => {
  const dom = setup(view); const w = dom.window, a = w.CalStackAdapter;
  const before = w.document.body.innerHTML;
  const snapshot = a.scan(w.document);
  assert.equal(a.account(w.document), 'owner@example.com');
  assert.equal(snapshot.events.length, 3);
  const pairs = w.CalStackCore.findPairs(snapshot.events, fixture.company, fixture.personal).pairs;
  const changes = new a.Changes(), hidden = new Set(pairs[0].company.map(e => e.element));
  a.layout(w.document, hidden, changes); changes.merge(pairs[0]);
  const c = w.document.querySelector('[data-eventid=c1]'), p = w.document.querySelector('[data-eventid=p1]');
  assert.equal(c.style.display, 'none');
  assert.equal(p.querySelectorAll('.calstack-badge svg rect').length, 2);
  assert.equal(p.querySelector('.calstack-badge').textContent, '');
  assert.notEqual(w.document.querySelector('[data-eventid=c2]').style.display, 'none');
  assert.match(p.querySelector('[role=button]')?.getAttribute('aria-label') || p.getAttribute('aria-label'), /会社カレンダーとタイトル・日時が一致/);
  if (view !== 'month') assert.equal(p.style.width, 'calc(100% - 2px)');
  else assert.equal(p.style.top, '0em');
  changes.restore();
  // CSSOMの空白正規化があるため、属性値は各項目で確認する。
  assert.equal(c.style.display, ''); assert.equal(c.getAttribute('aria-hidden'), null);
  assert.equal(p.querySelector('.calstack-badge'), null); assert.equal(p.getAttribute('aria-label'), null);
  assert.equal(p.querySelector('[data-calstack-title-row]'), null);
  assert.equal(p.querySelector('[data-calstack-title-text]'), null);
  assert.equal(p.getAttribute('data-calstack-hint'), null);
  assert.equal(p.style.width, view === 'month' ? '14.29%' : '50%');
  assert.equal(w.document.querySelectorAll('[data-eventchip]').length, 3);
  dom.window.close();
});
test('復元はGoogleの再描画による新しいスタイルを上書きしない', () => {
  const dom = setup(); const e = dom.window.document.querySelector('[data-eventid=p1]');
  const changes = new dom.window.CalStackAdapter.Changes();
  changes.style(e, 'left', '0%'); e.style.setProperty('left', '30%'); changes.restore();
  assert.equal(e.style.left, '30%'); dom.window.close();
});
test('同名でもカレンダーIDを区別し、識別情報欠落は判定しない', () => {
  const dom = setup(); const d = dom.window.document;
  d.querySelector('[data-eventid=p1]').removeAttribute('jslog');
  const snapshot = dom.window.CalStackAdapter.scan(d);
  assert.equal(snapshot.unreadable, 1); assert.equal(snapshot.events.length, 2);
  assert.equal(dom.window.CalStackCore.findPairs(snapshot.events, fixture.company, fixture.personal).pairs.length, 0);
  dom.window.close();
});
test('説明文のクラス名変更に対応し、未知の予定形式は件数で通知する', () => {
  const dom = setup(); const d = dom.window.document;
  d.querySelector('[data-eventid=c1] .XuJrye').className = 'new-google-class';
  assert.equal(dom.window.CalStackAdapter.scan(d).events.length,3);
  d.querySelector('[data-eventid=c1]').replaceChildren();
  assert.equal(dom.window.CalStackAdapter.scan(d).unreadable,1); dom.window.close();
});
test('日跨ぎの表示断片は同じ論理予定としてまとめる', () => {
  const data = {time:'2026年 10月 5日 23:00～2026年 10月 6日 01:00', date:''};
  const dom = setup('week', `<div>${fixture.chip({...data,id:'c1',calendar:fixture.company})}${fixture.chip({...data,id:'c1',calendar:fixture.company})}${fixture.chip({...data,id:'p1',calendar:fixture.personal})}${fixture.chip({...data,id:'p1',calendar:fixture.personal})}</div>`);
  const result = dom.window.CalStackCore.findPairs(dom.window.CalStackAdapter.scan(dom.window.document).events, fixture.company, fixture.personal);
  assert.equal(result.pairs.length, 1); assert.equal(result.pairs[0].company.length, 2); dom.window.close();
});
test('別セルへ伸びる複数日予定と同じ行で重ならないよう配置する', () => {
  const dom = setup('month', `<div role="row"><div role="gridcell"><div>${fixture.chip({id:'c1',calendar:fixture.company,stacked:true,width:28.57})}${fixture.chip({id:'p1',calendar:fixture.personal,stacked:true,width:28.57,row:1})}</div></div><div role="gridcell"><div>${fixture.chip({id:'c2',calendar:fixture.company,title:'別会議',stacked:true,left:14.29,width:14.29,row:2})}</div></div></div>`);
  const d = dom.window.document, a = dom.window.CalStackAdapter;
  const hidden = new Set([d.querySelector('[data-eventid=c1]')]);
  a.layout(d, hidden, new a.Changes());
  assert.equal(d.querySelector('[data-eventid=p1]').style.top, '0em');
  assert.equal(d.querySelector('[data-eventid=c2]').style.top, '1em'); dom.window.close();
});
test('元のクリック処理は保たれ、自分側の詳細を開く', () => {
  const dom = setup(); const d = dom.window.document; let opened = '';
  for (const e of d.querySelectorAll('[data-eventchip]')) e.addEventListener('click', () => {opened = e.dataset.eventid;});
  const pairs = dom.window.CalStackCore.findPairs(dom.window.CalStackAdapter.scan(d).events, fixture.company, fixture.personal).pairs;
  new dom.window.CalStackAdapter.Changes().merge(pairs[0]);
  d.querySelector('[data-eventid=p1]').click(); assert.equal(opened, 'p1'); dom.window.close();
});
