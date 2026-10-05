const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');
const label = (title = '定例会議', time = '09:00～10:00', date = '2026年 10月 5日', calendar = '会社') => `${time}、「${title}」、カレンダー: ${calendar}、場所の指定なし、${date}`;
const event = (calendarId, eventId, text = label()) => ({...core.parseLabel(text), calendarId, eventId});

test('タイトルは前後の空白だけ除去し、入れ子の括弧を保持する', () => {
  assert.equal(core.parseLabel(label('  会議「A」　B  ')).title, '会議「A」　B');
  assert.equal(core.findPairs([event('c', '1', label('会議  A')), event('p', '2', label('会議 A'))], 'c', 'p').pairs.length, 0);
});
test('完全一致だけをまとめ、タイトル・日時・終日区分の違いを残す', () => {
  const company = event('c', '1');
  assert.equal(core.findPairs([company, event('p', '2')], 'c', 'p').pairs.length, 1);
  for (const text of [label('別の会議'), label('定例会議', '09:00～10:01'), label('定例会議', '09:01～10:00'), label('定例会議', '終日')]) {
    assert.equal(core.findPairs([company, event('p', '2', text)], 'c', 'p').pairs.length, 0);
  }
});
test('時間指定の24時間予定を終日と区別する', () => {
  const timed = label('定例会議', '2026年 10月 5日 00:00～2026年 10月 6日 00:00', '');
  assert.equal(core.findPairs([event('c', '1', timed), event('p', '2', label('定例会議', '終日'))], 'c', 'p').pairs.length, 0);
});
test('日跨ぎと明示されたタイムゾーン内の日時を比較する', () => {
  const parsed = core.parseLabel(label('夜間', '2026年 10月 5日 23:00～2026年 10月 6日 01:00', ''));
  assert.equal(parsed.end - parsed.start, 2 * 3600000);
});
test('終日・月跨ぎ・年跨ぎの期間を排他的終了日に変換する', () => {
  for (const [date, duration] of [['2026年 10月 5日', 1], ['2026年 10月 10日 ～ 18日', 9], ['2026年 10月 30日 ～ 11月 2日', 4], ['2026年 12月 30日 ～ 2027年 1月 2日', 4]]) {
    const parsed = core.parseLabel(label('休暇', '終日', date));
    assert.equal((parsed.end - parsed.start) / 86400000, duration);
  }
});
test('不正・欠落した日時は判定に使わない', () => {
  for (const text of [label('会議', '25:00～26:00'), label('会議', '09:60～10:00'), label('会議', '10:00～09:00'), label('会議', '終日', '2026年 2月 30日'), label('', '終日'), '未知の表示形式']) assert.equal(core.parseLabel(text), null);
});
test('場所の説明を省略する祝日と、読点を含む名前を解析する', () => {
  assert.equal(core.parseLabel('終日、「祝日」、カレンダー: 日本の祝日、2026年 10月 12日').title,'祝日');
  assert.equal(core.parseLabel(label('定例会議','09:00～10:00','2026年 10月 5日','会社、営業')).calendarName,'会社、営業');
});
test('複数日表示の断片をまとめ、別イベントIDの複数候補は残す', () => {
  const events = [event('c', '1'), event('c', '1'), event('p', '2'), event('p', '2')];
  assert.equal(core.findPairs(events, 'c', 'p').pairs[0].company.length, 2);
  const result = core.findPairs([...events, event('p', '3')], 'c', 'p');
  assert.equal(result.pairs.length, 0); assert.equal(result.ambiguous, 1);
});
test('同じ繰り返しイベントIDでも開催日ごとに比較する', () => {
  const events = [event('c', 'repeat'), event('p', 'copy'), event('c', 'repeat', label('定例会議', '09:00～10:00', '2026年 10月 12日')), event('p', 'copy', label('定例会議', '09:00～10:00', '2026年 10月 12日'))];
  assert.equal(core.findPairs(events, 'c', 'p').pairs.length, 2);
});
test('対象外のカレンダーと片側のみの予定には変更しない', () => {
  assert.equal(core.findPairs([event('c', '1'), event('other', '2')], 'c', 'p').pairs.length, 0);
  assert.equal(core.findPairs([event('c', '1')], 'c', 'p').pairs.length, 0);
});
test('連鎖する重なりと終了時刻に接する予定を配置する', () => {
  const events = [{start: 0, end: 10}, {start: 5, end: 15}, {start: 10, end: 20}, {start: 20, end: 30}];
  const positions = core.columns(events);
  assert.deepEqual(positions.map(p => [p.left, p.width]), [[0, 50], [50, 50], [0, 50], [0, 100]]);
});
test('複数日の横幅を維持して行の空きを詰める', () => {
  const positions = core.packRows([{left: 0, width: 28.57, row: 1}, {left: 14.29, width: 14.29, row: 3}, {left: 28.57, width: 14.29, row: 4}]);
  assert.deepEqual(positions.map(p => p.row), [0, 1, 0]);
});
test('確認済み記録は30日で失効し、上限2048件を保持する', () => {
  const now=40*86400000, a='a'.repeat(64), b='b'.repeat(64);
  assert.deepEqual(core.cleanCache({[a]:now-31*86400000,[b]:now-1000,invalid:now},now),{[b]:now-1000});
  const entries=Object.fromEntries(Array.from({length:2100},(_,i)=>[i.toString(16).padStart(64,'0'),now-i]));
  assert.equal(Object.keys(core.cleanCache(entries,now)).length,2048);
});
test('再確認で消えた一致は削除し、別期間の記録は保持する', () => {
  const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
  const updated=core.updateCache({[a]:10,[b]:20},[a,c],[c],100);
  assert.deepEqual(updated,{[c]:100,[b]:20});
});
