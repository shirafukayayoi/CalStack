const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const fixture = require('./fixture.cjs');
const {mockChrome} = require('./runtime.cjs');
const enabled = {companyId:fixture.company, personalId:fixture.personal, enabled:true};
const key = 'account:owner@example.com';
function setup(view='week', initial={[key]:enabled}) {
  const dom = new JSDOM(fixture.body(view),{runScripts:'outside-only',url:`https://calendar.google.com/calendar/u/0/r/${view}`});
  const w = dom.window;
  w.TextDecoder = TextDecoder;
  w.TextEncoder = TextEncoder;
  Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
  w.HTMLElement.prototype.getClientRects = function() {return this.style.display==='none' ? [] : [{width:100,height:20}];};
  for(const file of ['core','adapter']) w.eval(fs.readFileSync(`extension/${file}.js`,'utf8'));
  return {dom, w, ...mockChrome(w, initial)};
}
const state = runtime => runtime.message({type:'calstack:state'});
test('初期未設定、保存、無効化、再有効化を通して状態と表示が一致する', async () => {
  const r=setup('week',{});
  try {
    assert.equal((await state(r)).merged,0);
    const save=await r.message({type:'calstack:settings',account:'owner@example.com',settings:enabled});
    assert.equal(save.state.merged,1); assert.equal(r.data[key].enabled,true);
    const off=await r.message({type:'calstack:settings',account:'owner@example.com',settings:{...enabled,enabled:false}});
    assert.equal(off.state.merged,0); assert.equal(r.w.document.querySelector('[data-eventid=c1]').style.display,'');
    assert.equal(r.w.document.querySelectorAll('.calstack-badge').length,0);
    assert.equal((await r.message({type:'calstack:settings',account:'owner@example.com',settings:enabled})).state.merged,1);
  } finally {r.w.close();}
});
test('編集後の内容を再判定し、古い非表示と印を除去する', async () => {
  const r=setup();
  try {
    await state(r);
    r.w.document.querySelector('[data-eventid=p1] .XuJrye').textContent='09:00～10:01、「定例会議」、カレンダー: 自分、場所の指定なし、2026年 10月 5日';
    assert.equal((await state(r)).merged,0);
    assert.equal(r.w.document.querySelector('[data-eventid=c1]').style.display,'');
    assert.equal(r.w.document.querySelectorAll('.calstack-badge').length,0);
  } finally {r.w.close();}
});
test('Google側が再利用した予定要素の新しい日時と位置を保持する', async () => {
  const r=setup();
  try {
    await state(r);
    const e=r.w.document.querySelector('[data-eventid=p1]');
    e.style.width='70%'; e.setAttribute('aria-label','10:00～11:00、「別の予定」、カレンダー: 自分、場所の指定なし、2026年 10月 6日');
    assert.equal((await state(r)).merged,0); assert.equal(e.style.width,'70%');
  } finally {r.w.close();}
});
test('会社側を隠しても確認済みの印は残し、対象外ビューでは通常表示に戻す', async () => {
  const r=setup();
  try {
    await state(r);
    r.w.document.querySelector('input[aria-label="会社"]').checked=false;
    assert.equal((await state(r)).merged,1);
    assert.match(r.w.document.querySelector('[data-calstack-hint]').getAttribute('data-calstack-hint'),/会社側は非表示/);
    r.w.document.querySelector('input[aria-label="会社"]').checked=true;
    r.w.history.pushState({},'', '/calendar/u/0/r/agenda');
    assert.equal((await state(r)).merged,0); assert.equal(r.w.document.querySelectorAll('.calstack-badge').length,0);
  } finally {r.w.close();}
});
test('予定要素の入れ替えをMutationObserverが検知する', async () => {
  const r=setup();
  try {
    await state(r);
    r.w.document.querySelector('[data-eventid=p1]').remove();
    await new Promise(resolve=>setTimeout(resolve,220));
    assert.equal(r.w.document.querySelector('[data-eventid=c1]').style.display,'');
  } finally {r.w.close();}
});
test('アカウント変更時は別の設定を読み込み、元の設定を流用しない', async () => {
  const r=setup();
  try {
    await state(r);
    r.w.document.querySelector('button[aria-label]').setAttribute('aria-label','Google アカウント: 別ユーザー (second@example.com)');
    const next=await state(r);
    assert.equal(next.account,'second@example.com'); assert.equal(next.merged,0); assert.equal(next.settings.companyId,undefined);
    assert.match((await r.message({type:'calstack:settings',account:'owner@example.com',settings:enabled})).error,/アカウント/);
  } finally {r.w.close();}
});
test('不正な設定と外部からのメッセージを受け付けない', async () => {
  const r=setup();
  try {
    await state(r);
    assert.equal(await r.message({type:'calstack:state'},{id:'other-extension'}),undefined);
    assert.match((await r.message({type:'calstack:settings',account:'owner@example.com',settings:{...enabled,personalId:fixture.company}})).error,/異なる/);
  } finally {r.w.close();}
});
test('一覧に保存済みカレンダーがなくても無効化できる', async () => {
  const r=setup();
  try {
    await state(r); r.w.document.querySelector('aside').remove(); r.w.document.querySelector('main').remove();
    await state(r);
    const result=await r.message({type:'calstack:settings',account:'owner@example.com',settings:{...enabled,enabled:false}});
    assert.equal(result.ok,true); assert.equal(result.state.merged,0);
  } finally {r.w.close();}
});
test('会社非表示の初回は推測せず、表示後に確認済みの印を記録する',async()=>{
  const r=setup();
  try{
    const checkbox=r.w.document.querySelector('input[aria-label="会社"]');checkbox.checked=false;
    assert.equal((await state(r)).merged,0);
    checkbox.checked=true;assert.equal((await state(r)).merged,1);
    checkbox.checked=false;const result=await state(r);assert.equal(result.merged,1);assert.equal(result.cached,true);
    assert.match(r.w.document.querySelector('[data-calstack-hint]').getAttribute('data-calstack-hint'),/会社側は非表示/);
  }finally{r.w.close();}
});
test('会社側を非表示にしたまま再読み込みしても記録は残る',async()=>{
  const original=setup();let saved;
  try{await state(original);saved=JSON.parse(JSON.stringify(original.data));}finally{original.w.close();}
  const r=setup('week',saved);
  try{
    r.w.document.querySelector('input[aria-label="会社"]').checked=false;
    r.w.document.querySelectorAll('[data-eventid^="c"]').forEach(e=>e.remove());
    assert.equal((await state(r)).merged,1);
    const cacheKey=Object.keys(r.data).find(key=>key.startsWith('calstack:matches:'));
    assert.ok(cacheKey);
    assert.ok(Object.keys(r.data[cacheKey]).every(hash=>/^[a-f0-9]{64}$/.test(hash)));
    assert.ok(!JSON.stringify(r.data).includes('定例会議'));
  }finally{r.w.close();}
});
test('会社側で対応が変更されたら再表示時に古い記録を除く',async()=>{
  const r=setup();
  try{
    await state(r);
    r.w.document.querySelector('[data-eventid=c1] .XuJrye').textContent='09:00～10:01、「定例会議」、カレンダー: 会社、場所の指定なし、2026年 10月 5日';
    assert.equal((await state(r)).merged,0);
    r.w.document.querySelector('input[aria-label="会社"]').checked=false;
    assert.equal((await state(r)).merged,0);
  }finally{r.w.close();}
});
test('自分側非表示・無効化では確認済みの印も除く',async()=>{
  const r=setup();
  try{
    await state(r);r.w.document.querySelector('input[aria-label="会社"]').checked=false;
    assert.equal((await state(r)).merged,1);
    r.w.document.querySelector('input[aria-label="自分"]').checked=false;
    assert.equal((await state(r)).merged,0);assert.equal(r.w.document.querySelectorAll('.calstack-badge').length,0);
    r.w.document.querySelector('input[aria-label="自分"]').checked=true;
    await state(r);
    await r.message({type:'calstack:settings',account:'owner@example.com',settings:{...enabled,enabled:false}});
    assert.equal(r.w.document.querySelectorAll('.calstack-badge').length,0);
  }finally{r.w.close();}
});
test('タイトル行を識別できない場合は重複も隠さず、ポップアップへ通知する',async()=>{
  const r=setup();
  try{
    await state(r);
    r.w.document.querySelector('[data-eventid=p1] .I0UMhf').className='changed-title-class';
    const result=await state(r);
    assert.equal(result.merged,0);assert.equal(result.unmarked,1);
    assert.equal(r.w.document.querySelector('[data-eventid=c1]').style.display,'');
    assert.equal(r.w.document.querySelector('[data-eventid=p1]').style.width,'50%');
    assert.equal(r.w.document.querySelectorAll('.calstack-badge').length,0);
    assert.match(result.message,/タイトル行を識別できない/);
  }finally{r.w.close();}
});
test('説明だけの表示・移動で再判定ループを起こさず、予定の変化は再判定する',async()=>{
  const r=setup();
  try{
    await state(r);await new Promise(resolve=>setTimeout(resolve,220));
    let refreshes=0;
    const prototype=r.w.CalStackAdapter.Changes.prototype, original=prototype.restore;
    prototype.restore=function(){refreshes++;return original.call(this);};
    const p=r.w.document.querySelector('[data-eventid=p1]');p.focus();
    assert.ok(r.w.document.querySelector('[data-calstack-tooltip]'));
    r.w.dispatchEvent(new r.w.Event('scroll'));
    p.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,220));assert.equal(refreshes,0);
    p.querySelector('.I0UMhf').textContent='編集中の別タイトル';
    await new Promise(resolve=>setTimeout(resolve,220));assert.ok(refreshes>0);
    assert.equal(r.w.document.querySelector('.calstack-badge'),null);
  }finally{r.w.close();}
});
