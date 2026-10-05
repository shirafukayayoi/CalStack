const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const setup = async (url='https://calendar.google.com/calendar/u/0/r/week',state={account:'owner@example.com',settings:{},calendars:[{id:'c',name:'会社',visible:true},{id:'p',name:'自分',visible:true}],message:'選んでください。'}) => {
  const dom=new JSDOM(fs.readFileSync('extension/popup.html','utf8'),{runScripts:'outside-only',url:'https://extension.example/popup.html'});
  const sent=[];
  dom.window.chrome={tabs:{query:async()=>[{id:1,url}],sendMessage:async(id,message)=>{
    sent.push(message);
    if(message.type==='calstack:state')return state;
    return {ok:true,state:{...state,settings:message.settings,message:'保存しました。'}};
  }}};
  dom.window.eval(fs.readFileSync('extension/popup.js','utf8'));
  await new Promise(resolve=>setImmediate(resolve));
  return {dom,sent,d:dom.window.document};
};
test('ポップアップで2つのカレンダーと有効状態を保存する',async()=>{
  const r=await setup();
  try{
    r.d.getElementById('company').value='c';r.d.getElementById('personal').value='p';r.d.getElementById('enabled').checked=true;
    r.d.getElementById('settings').dispatchEvent(new r.dom.window.Event('submit',{cancelable:true}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual({...r.sent.at(-1).settings},{companyId:'c',personalId:'p',enabled:true});
    assert.equal(r.d.getElementById('status').textContent,'保存しました。');
  }finally{r.dom.window.close();}
});
test('他のタブでは設定を無効にし、日本語の案内を表示する',async()=>{
  const r=await setup('https://example.com');
  try{assert.equal(r.d.getElementById('save').disabled,true);assert.match(r.d.getElementById('status').textContent,/Googleカレンダーのタブ/);}finally{r.dom.window.close();}
});
test('同名カレンダーはIDを表示し、保存済みカレンダーも残す',async()=>{
  const r=await setup(undefined,{account:'owner@example.com',settings:{companyId:'saved',personalId:'p',enabled:true},calendars:[{id:'c',name:'同名',duplicateName:true,visible:true},{id:'p',name:'同名',duplicateName:true,visible:true}],message:'確認'});
  try{assert.equal(r.d.getElementById('company').value,'saved');assert.match(r.d.getElementById('personal').textContent,/同名（p）/);assert.equal(r.d.getElementById('enabled').checked,true);}finally{r.dom.window.close();}
});
