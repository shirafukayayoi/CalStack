const company = 'company@example.com', personal = 'personal@example.com';
const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function chip({id, calendar, title = '定例会議', time = '09:00～10:00', date = '2026年 10月 5日', stacked = false, left = 0, width = 100, row = 0, top = 60, height = 40, compact = false}) {
  const name = calendar === company ? '会社' : '自分';
  const label = `${time}、「${title}」、カレンダー: ${name}、場所の指定なし、${date}`;
  const common = `data-eventchip data-opens-details="true" data-eventid="${id}" jslog="${escape(`35463; 1:["${calendar}",2];track:click`)}"`;
  const visibleTime = `<span class="fixture-time">${time}</span>`;
  return stacked ? `<div ${common} data-stacked-layout-chip-container="true" style="left:${left}%;width:${width}%;top:${row}em"><div role="button" tabindex="0" data-stacked-layout-chip="true"><span aria-hidden="true" class="nHqeVd">${time === '終日' ? '' : visibleTime}<span class="WBi6vc">${escape(title)}</span></span><span class="XuJrye">${escape(label)}</span></div></div>` : `<div ${common} role="button" tabindex="0" style="top:${top}px;height:${height}px;left:${left}%;width:${width}%"><div class="XuJrye">${escape(label)}</div><div aria-hidden="true"><span class="KcY3wb"><span class="I0UMhf">${escape(title)}</span>${compact ? visibleTime : ''}</span>${compact ? '' : `<div>${visibleTime}</div>`}</div></div>`;
}
function sidebar(id, name, checked = true) { return `<div data-id="${Buffer.from(id).toString('base64')}"><label><input type="checkbox" aria-label="${name}" ${checked ? 'checked' : ''}>${name}</label></div>`; }
function body(view = 'week') {
  const stacked = view === 'month';
  return `<button aria-label="Google アカウント: テスト (owner@example.com)">アカウント</button><aside>${sidebar(company, '会社')}${sidebar(personal, '自分')}</aside><main><div role="row"><div role="gridcell"><div role="presentation" class="events">${chip({id:'c1', calendar:company, stacked, left:0, width:stacked ? 14.29 : 50, row:0})}${chip({id:'p1', calendar:personal, stacked, left:stacked ? 0 : 50, width:stacked ? 14.29 : 50, row:1})}${chip({id:'c2', calendar:company, title:'未コピーの会議', time:'11:00～12:00', stacked, left:0, width:stacked ? 14.29 : 100, row:2, top:150})}</div></div></div><div id="detail" role="status"></div></main>`;
}
function uxBody() {
  const pair = (id, options) => chip({...options,id:'c'+id,calendar:company}) + chip({...options,id:'p'+id,calendar:personal});
  return `<button aria-label="Google アカウント: テスト (owner@example.com)">アカウント</button><aside>${sidebar(company,'会社')}${sidebar(personal,'自分')}</aside><main class="ux">
    <section><h2>短い枠・同じ行の時刻</h2><div class="events short">${pair('1',{title:'打ち合わせ',time:'09:00～09:15',top:12,height:20,compact:true})}</div></section>
    <section><h2>重なる予定・長いタイトル</h2><div class="events narrow">${pair('2',{title:'プロジェクト定例会議・次回リリースの確認',top:12,height:88})}${chip({id:'other1',calendar:personal,title:'別の予定A',top:12,height:88})}${chip({id:'other2',calendar:personal,title:'別の予定B',top:12,height:88})}${chip({id:'other3',calendar:personal,title:'別の予定C',top:12,height:88})}</div></section>
    <section><h2>月表示の1行・長いタイトル</h2><div class="events monthly">${pair('3',{title:'営業チーム定例ミーティング',stacked:true,width:100,row:0})}</div></section>
    <section><h2>終日欄・淡い色</h2><div class="events monthly light">${pair('4',{title:'会社イベント',time:'終日',stacked:true,width:100,row:0})}</div></section>
    <section><h2>濃い色</h2><div class="events dark">${pair('5',{title:'夕方の打ち合わせ',time:'17:00～18:00',top:12,height:55})}${chip({id:'uncopied',calendar:company,title:'未コピーの会社予定',time:'19:00～19:30',top:80,height:30,compact:true})}</div></section>
    <div id="detail" role="status"></div></main>`;
}
module.exports = {company, personal, chip, sidebar, body, uxBody};
