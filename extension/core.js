(function (root) {
  'use strict';
  const datePattern = '(\\d{4})年\\s*(\\d{1,2})月\\s*(\\d{1,2})日';
  function day(y, m, d) {
    const value = Date.UTC(+y, +m - 1, +d);
    const date = new Date(value);
    return date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1 && date.getUTCDate() === +d ? value : null;
  }
  function clock(h, m) { return +h < 24 && +m < 60 ? (+h * 60 + +m) * 60000 : null; }
  function parseLabel(label) {
    // タイトル内の括弧や読点を保持し、画面の説明文だけを解析する。
    const parts = label?.match(/^(.*?)、「(.*)」、カレンダー: (.*?)(?:、場所(?:の指定なし|: .*?))?、((?:\d{4}年.*)?)$/s);
    if (!parts || !parts[2].trim() || !parts[3]) return null;
    const [, prefix, title, calendarName, suffix] = parts;
    let start, end;
    const allDay = prefix === '終日';
    if (allDay) {
      const dates = suffix.match(new RegExp('^' + datePattern + '(?:\\s*[～〜]\\s*(?:(\\d{4})年\\s*)?(?:(\\d{1,2})月\\s*)?(\\d{1,2})日)?$'));
      if (!dates) return null;
      start = day(dates[1], dates[2], dates[3]);
      const last = dates[6] ? day(dates[4] || dates[1], dates[5] || dates[2], dates[6]) : start;
      if (start === null || last === null || last < start) return null;
      end = last + 86400000;
    } else {
      const full = prefix.match(new RegExp('^' + datePattern + '\\s+(\\d{1,2}):(\\d{2})[～〜]' + datePattern + '\\s+(\\d{1,2}):(\\d{2})$'));
      const simple = prefix.match(/^(\d{1,2}):(\d{2})[～〜](\d{1,2}):(\d{2})$/);
      if (full) {
        const d1 = day(full[1], full[2], full[3]), d2 = day(full[6], full[7], full[8]);
        const c1 = clock(full[4], full[5]), c2 = clock(full[9], full[10]);
        if ([d1, d2, c1, c2].includes(null)) return null;
        start = d1 + c1; end = d2 + c2;
      } else if (simple) {
        const dates = suffix.match(new RegExp('^' + datePattern + '$'));
        if (!dates) return null;
        const d = day(dates[1], dates[2], dates[3]);
        const c1 = clock(simple[1], simple[2]), c2 = clock(simple[3], simple[4]);
        if ([d, c1, c2].includes(null)) return null;
        start = d + c1; end = d + c2;
      } else return null;
      if (end <= start) return null;
    }
    return {title: title.trim(), calendarName, start, end, allDay};
  }
  function signature(event) { return JSON.stringify([event.title.trim(), event.start, event.end, event.allDay]); }
  function findPairs(events, companyId, personalId) {
    if (!companyId || !personalId || companyId === personalId) return {pairs: [], ambiguous: 0};
    const groups = new Map();
    for (const event of events) {
      if (![companyId, personalId].includes(event.calendarId) || !event.eventId) continue;
      const key = signature(event);
      if (!groups.has(key)) groups.set(key, {company: new Map(), personal: new Map()});
      const side = groups.get(key)[event.calendarId === companyId ? 'company' : 'personal'];
      if (!side.has(event.eventId)) side.set(event.eventId, []);
      side.get(event.eventId).push(event);
    }
    const pairs = []; let ambiguous = 0;
    for (const group of groups.values()) {
      if (!group.company.size || !group.personal.size) continue;
      if (group.company.size !== 1 || group.personal.size !== 1) { ambiguous++; continue; }
      pairs.push({company: [...group.company.values()][0], personal: [...group.personal.values()][0]});
    }
    return {pairs, ambiguous};
  }
  function overlap(a, b) { return a.start < b.end && b.start < a.end; }
  function columns(events) {
    // 連鎖する重なりをひとつの集合とし、終了済みの列を再利用する。
    const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
    const result = []; let cluster = [], maxEnd = -Infinity;
    function flush() {
      const lanes = [];
      for (const event of cluster) {
        let column = lanes.findIndex(lane => lane.at(-1).end <= event.start);
        if (column === -1) { column = lanes.length; lanes.push([]); }
        lanes[column].push(event);
        result.push({event, column, lanes});
      }
      for (const item of result.filter(item => item.lanes === lanes)) {
        let span = 1;
        for (let c = item.column + 1; c < lanes.length; c++) {
          if (lanes[c].some(other => overlap(item.event, other))) break;
          span++;
        }
        item.left = item.column / lanes.length * 100;
        item.width = span / lanes.length * 100;
        delete item.lanes;
      }
      cluster = []; maxEnd = -Infinity;
    }
    for (const event of sorted) {
      if (cluster.length && event.start >= maxEnd) flush();
      cluster.push(event); maxEnd = Math.max(maxEnd, event.end);
    }
    if (cluster.length) flush();
    return result;
  }
  function packRows(items) {
    const lanes = [];
    return [...items].sort((a, b) => a.row - b.row || a.left - b.left).map(item => {
      let row = lanes.findIndex(lane => lane.every(other => item.left >= other.left + other.width - 0.02 || other.left >= item.left + item.width - 0.02));
      if (row < 0) { row = lanes.length; lanes.push([]); }
      lanes[row].push(item);
      return {item, row};
    });
  }
  const CACHE_TTL = 30 * 86400000;
  function cleanCache(value, now) {
    return Object.fromEntries(Object.entries(value || {}).filter(([hash, stamp]) => /^[a-f0-9]{64}$/.test(hash) && Number.isFinite(stamp) && stamp <= now && now - stamp < CACHE_TTL).sort((a,b) => b[1] - a[1]).slice(0,2048));
  }
  function updateCache(value, personalHashes, confirmedHashes, now) {
    const entries = cleanCache(value, now);
    // 表示中のコピーを会社側と再確認し、対応が消えた印を次回へ持ち越さない。
    const before = {...entries};
    for (const hash of personalHashes) delete entries[hash];
    for (const hash of confirmedHashes) entries[hash] = before[hash] && now - before[hash] < 60000 ? before[hash] : now;
    return cleanCache(entries, now);
  }
  const api = {parseLabel, signature, findPairs, columns, packRows, cleanCache, updateCache};
  root.CalStackCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
