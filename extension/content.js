(() => {
  'use strict';
  if (globalThis.__calstackStarted) return;
  globalThis.__calstackStarted = true;
  const adapter = CalStackAdapter, core = CalStackCore;
  const changes = new adapter.Changes();
  const hints = CalStackHints.create(document);
  let state = {}, settings = {}, currentAccount = null, timer = null, running = Promise.resolve();
  let cacheKey = null, cache = {};
  async function fingerprints(events) {
    const signatures = [...new Set(events.map(core.signature))];
    return new Map(await Promise.all(signatures.map(async signature => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
      return [signature, [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('')];
    })));
  }
  const observe = () => observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'aria-label', 'aria-hidden', 'checked', 'data-id', 'data-eventid', 'jslog']});
  const observer = new MutationObserver(records => {
    // 説明の表示・移動だけでは予定を再判定しない。
    const relevant = records.some(record => !CalStackHints.owns(record.target) &&
      (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !CalStackHints.owns(node))));
    if (relevant) schedule();
  });
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 120); }
  function refresh() { running = running.then(run, run); return running; }
  async function run() {
    observer.disconnect(); changes.restore();
    try {
      const account = adapter.account(document);
      if (account !== currentAccount) {
        const loaded = account ? (await chrome.storage.local.get('account:' + account))['account:' + account] || {} : {};
        settings = loaded; currentAccount = account;
      }
      const snapshot = adapter.scan(document);
      const nextCacheKey = account && settings.companyId && settings.personalId ? 'calstack:matches:' + JSON.stringify([account,settings.companyId,settings.personalId]) : null;
      if (nextCacheKey !== cacheKey) {
        cache = nextCacheKey ? (await chrome.storage.local.get(nextCacheKey))[nextCacheKey] || {} : {};
        cacheKey = nextCacheKey;
      }
      cache = core.cleanCache(cache, Date.now());
      const view = location.pathname.match(/\/r\/(month|week|day)(?:\/|$)/)?.[1];
      state = {account, settings, calendars: snapshot.calendars, merged: 0, ambiguous: 0, unmarked: 0, unreadable: snapshot.unreadable, view};
      if (!account) state.message = 'アカウントを識別できません。Googleカレンダーの読み込み完了を確認してください。';
      else if (!settings.companyId || !settings.personalId) state.message = '会社と自分のカレンダーを選んでください。';
      else if (settings.enabled !== true) state.message = 'まとめ表示は無効です。';
      else if (!view) state.message = '月・週・日表示で利用できます。';
      else if (settings.companyId === settings.personalId) state.message = '会社と自分には異なるカレンダーを選んでください。';
      else if (snapshot.calendars.some(c => c.id === settings.personalId && !c.visible)) state.message = '自分のカレンダーをGoogleカレンダーで表示してください。';
      else {
        const company = snapshot.calendars.find(c => c.id === settings.companyId);
        const personalEvents = snapshot.events.filter(e => e.calendarId === settings.personalId);
        const hashes = await fingerprints(personalEvents);
        if (company?.visible) {
          const result = core.findPairs(snapshot.events, settings.companyId, settings.personalId);
          const pairs = result.pairs.filter(pair => pair.personal.every(event => adapter.titleParts(event)));
          state.unmarked = result.pairs.length - pairs.length;
          const hidden = new Set(pairs.flatMap(pair => pair.company.map(e => e.element)));
          // 配置計算は非表示にする前の枠を使う。
          adapter.layout(document, hidden, changes);
          for (const pair of pairs) changes.merge(pair);
          const next = core.updateCache(cache, [...hashes.values()], result.pairs.map(pair => hashes.get(core.signature(pair.personal[0]))), Date.now());
          if (JSON.stringify(next) !== JSON.stringify(cache)) { await chrome.storage.local.set({[cacheKey]:next}); cache = next; }
          state.merged = pairs.length; state.ambiguous = result.ambiguous;
          state.message = `${state.merged}件の重複予定をまとめています。`;
        } else {
          // 会社側を隠した場合は、確認済みの一致だけを自分側へ表示する。
          const groups = new Map();
          for (const event of personalEvents) {
            const signature = core.signature(event);
            if (!groups.has(signature)) groups.set(signature,new Map());
            const group = groups.get(signature);
            if (!group.has(event.eventId)) group.set(event.eventId,[]);
            group.get(event.eventId).push(event);
          }
          for (const [signature, group] of groups) {
            const checkedAt = cache[hashes.get(signature)];
            if (!checkedAt) continue;
            if (group.size !== 1) {state.ambiguous++;continue;}
            const events = [...group.values()][0];
            if (!events.every(event => adapter.titleParts(event))) { state.unmarked++; continue; }
            for (const event of events) changes.annotate(event,company?.name || '会社のカレンダー',checkedAt);
            state.merged++;
          }
          state.cached = true;
          state.message = state.merged ? `会社側は非表示です。前回確認した情報で${state.merged}件に一致の印を付けています。` : '会社側は非表示です。会社のカレンダーを一度表示すると、確認できた一致を記録し、非表示に戻しても印を残せます。';
        }
        if (snapshot.unreadable) state.message += ` ${snapshot.unreadable}個の表示要素は解析できないため、そのまま表示しています。`;
        if (state.ambiguous) state.message += ` ${state.ambiguous}組は対応が曖昧なため、そのまま表示しています。`;
        if (state.unmarked) state.message += ` ${state.unmarked}件は印を置くタイトル行を識別できないため、通常表示を保っています。`;
      }
    } catch {
      changes.restore();
      state = {...state, merged: 0, message: '画面を解析できないため通常表示に戻しました。再読み込みしてください。'};
    } finally { hints.sync(); observe(); }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'calstack:state') {
      refresh().then(() => respond(state)); return true;
    }
    if (message?.type === 'calstack:settings') {
      if (!currentAccount || message.account !== currentAccount) { respond({error: 'アカウントが変わりました。ポップアップを開き直してください。'}); return; }
      const {companyId, personalId, enabled} = message.settings || {};
      const ids = new Set(state.calendars?.map(c => c.id));
      const savedPair = companyId === settings.companyId && personalId === settings.personalId;
      if ((!savedPair && (!ids.has(companyId) || !ids.has(personalId))) || !companyId || !personalId || companyId === personalId || typeof enabled !== 'boolean') { respond({error: '異なる2つのカレンダーを選んでください。'}); return; }
      const value = {companyId, personalId, enabled};
      chrome.storage.local.set({['account:' + currentAccount]: value}).then(async () => {
        settings = value; await refresh(); respond({ok: true, state});
      }).catch(() => respond({error: '設定を保存できませんでした。'}));
      return true;
    }
  });
  chrome.storage.onChanged.addListener((values, area) => {
    const value = values['account:' + currentAccount];
    if (area === 'local' && value) { settings = value.newValue || {}; schedule(); }
    if (area === 'local' && cacheKey && values[cacheKey]) { cache = values[cacheKey].newValue || {}; schedule(); }
  });
  window.addEventListener('resize', schedule);
  document.addEventListener('change', schedule, true);
  window.addEventListener('popstate', schedule);
  // 同一ページ内のURL変更と、遅れて更新されるアカウント表示を補足する。
  let lastUrl = location.href;
  setInterval(() => { if (lastUrl !== location.href || adapter.account(document) !== currentAccount) { lastUrl = location.href; schedule(); } }, 1000);
  refresh();
})();
