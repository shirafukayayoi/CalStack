const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const fixture = require('./fixture.cjs');
function setup() {
  const dom = new JSDOM(fixture.body(), {runScripts:'outside-only'}), w = dom.window, d = w.document;
  w.TextDecoder = TextDecoder;
  w.HTMLElement.prototype.getClientRects = function() {return [{width:100,height:20}];};
  for (const name of ['core','adapter','hints']) w.eval(fs.readFileSync(`extension/${name}.js`,'utf8'));
  const changes = new w.CalStackAdapter.Changes();
  const pairs = w.CalStackCore.findPairs(w.CalStackAdapter.scan(d).events,fixture.company,fixture.personal).pairs;
  changes.merge(pairs[0]);
  return {dom,w,d,changes,hints:w.CalStackHints.create(d),p:d.querySelector('[data-eventid=p1]')};
}
test('フォーカスで一致の説明を表示し、Escapeで閉じたままにする',()=>{
  const r = setup();
  try {
    const before = r.d.querySelectorAll('[tabindex]').length;
    r.p.focus();
    assert.match(r.d.querySelector('[data-calstack-tooltip]').textContent,/会社カレンダーとタイトル・日時が一致/);
    assert.equal(r.d.querySelectorAll('[tabindex]').length,before);
    assert.equal(r.d.querySelector('.calstack-badge').getAttribute('aria-hidden'),'true');
    r.p.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    r.hints.sync(); assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
    r.p.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
    r.p.blur(); r.p.focus(); assert.ok(r.d.querySelector('[data-calstack-tooltip]'));
  } finally {r.w.close();}
});
test('子要素間のホバー移動で説明を保ち、クリックは元の詳細処理へ届く',()=>{
  const r=setup();
  try {
    const text=r.p.querySelector('.I0UMhf'), mark=r.p.querySelector('.calstack-badge');
    text.dispatchEvent(new r.w.MouseEvent('pointerover',{bubbles:true}));
    const tooltip=r.d.querySelector('[data-calstack-tooltip]'); assert.ok(tooltip);
    text.dispatchEvent(new r.w.MouseEvent('pointerout',{bubbles:true,relatedTarget:mark}));
    assert.equal(r.d.querySelector('[data-calstack-tooltip]'),tooltip);
    let opened=false;
    r.p.addEventListener('click',event=>{opened=true;assert.equal(event.defaultPrevented,false);});
    r.p.click(); assert.equal(opened,true); r.hints.sync();
    assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
  } finally {r.w.close();}
});
test('再判定で説明を更新し、無効化や予定の削除で説明も消す',()=>{
  const r=setup();
  try {
    r.p.focus();
    r.changes.restore();
    const events=r.w.CalStackAdapter.scan(r.d).events;
    const personal=events.find(e=>e.calendarId===fixture.personal);
    r.changes.annotate(personal,'会社',Date.UTC(2026,9,5));r.hints.sync();
    assert.match(r.d.querySelector('[data-calstack-tooltip]').textContent,/会社カレンダー：会社/);
    assert.doesNotMatch(r.d.querySelector('[data-calstack-tooltip]').textContent,/前回の一致確認|2026\/10\/5/);
    assert.doesNotMatch(r.p.getAttribute('aria-label'),/前回の一致確認|2026\/10\/5/);
    assert.match(r.p.getAttribute('aria-label'),/現在の変更・削除は未確認/);
    assert.equal(r.p.querySelector('.calstack-badge').getAttribute('data-calstack-cached'),'true');
    r.changes.restore();r.hints.sync();assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
    r.changes.annotate(personal,'会社');r.p.blur();r.p.focus();assert.ok(r.d.querySelector('[data-calstack-tooltip]'));
    r.p.remove();r.hints.sync();assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
  } finally {r.w.close();}
});
test('予定詳細へフォーカスが移っても、クリックで閉じた説明を再表示しない',()=>{
  const r=setup();
  try {
    r.p.focus();
    r.p.dispatchEvent(new r.w.MouseEvent('pointerover',{bubbles:true}));
    r.p.addEventListener('click',()=>r.d.querySelector('button').focus());
    r.p.click();r.hints.sync();
    assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
    assert.notEqual(r.d.activeElement,r.p);
  } finally {r.w.close();}
});
test('Escape後にGoogleが同じ予定へフォーカスを戻しても説明は閉じたまま',()=>{
  const r=setup();
  try {
    r.p.focus();
    r.p.dispatchEvent(new r.w.MouseEvent('pointerover',{bubbles:true}));
    r.p.addEventListener('keydown',event=>{if(event.key==='Escape'){r.p.blur();r.p.focus();}});
    r.p.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
    r.p.dispatchEvent(new r.w.MouseEvent('pointerout',{bubbles:true}));
    r.hints.sync();assert.equal(r.d.querySelector('[data-calstack-tooltip]'),null);
    r.p.dispatchEvent(new r.w.MouseEvent('pointerover',{bubbles:true}));
    assert.ok(r.d.querySelector('[data-calstack-tooltip]'));
  } finally {r.w.close();}
});
test('説明は画面端で折り返してビューポート内へ配置する',()=>{
  const r=setup();
  try {
    Object.defineProperty(r.w,'innerWidth',{value:240});Object.defineProperty(r.w,'innerHeight',{value:200});
    r.w.HTMLElement.prototype.getBoundingClientRect=function(){return this.hasAttribute('data-calstack-tooltip') ? {width:220,height:80} : {top:185,bottom:197,left:226,right:238};};
    r.p.focus();const tooltip=r.d.querySelector('[data-calstack-tooltip]');
    assert.equal(tooltip.style.left,'12px');assert.equal(tooltip.style.top,'99px');
    assert.equal(r.w.CalStackHints.owns(tooltip.firstChild),true);
    assert.equal(r.w.CalStackHints.owns(r.p),false);
  } finally {r.w.close();}
});
