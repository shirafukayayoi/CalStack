(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let tabId, account;
  function render(state) {
    account = state.account;
    $('account').textContent = account || 'アカウントを識別できません';
    $('status').textContent = state.message;
    for (const [name, key] of [['company', 'companyId'], ['personal', 'personalId']]) {
      const select = $(name); select.replaceChildren(new Option('選んでください', ''));
      for (const calendar of state.calendars || []) {
        const title = calendar.name + (calendar.duplicateName ? `（${calendar.id}）` : '') + (calendar.visible ? '' : '［非表示］');
        select.add(new Option(title, calendar.id));
      }
      const saved = state.settings?.[key];
      if (saved && ![...select.options].some(option => option.value === saved)) select.add(new Option('保存済みカレンダー［現在の一覧にありません］', saved));
      select.value = saved || ''; select.disabled = !account;
    }
    $('enabled').checked = state.settings?.enabled === true;
    $('enabled').disabled = !account; $('save').disabled = !account || ((state.calendars || []).length < 2 && !state.settings?.companyId);
  }
  async function load() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab?.url?.startsWith('https://calendar.google.com/calendar/')) throw new Error('Googleカレンダーのタブを開いてから、CalStackを開いてください。');
      tabId = tab.id;
      render(await chrome.tabs.sendMessage(tabId, {type: 'calstack:state'}));
    } catch (error) {
      $('account').textContent = '接続できません';
      $('status').textContent = error.message.includes('Googleカレンダーのタブ') ? error.message : 'Googleカレンダーを再読み込みして、CalStackを開き直してください。';
    }
  }
  $('settings').addEventListener('submit', async event => {
    event.preventDefault(); $('save').disabled = true;
    try {
      const result = await chrome.tabs.sendMessage(tabId, {type: 'calstack:settings', account, settings: {companyId: $('company').value, personalId: $('personal').value, enabled: $('enabled').checked}});
      if (result.error) throw new Error(result.error);
      render(result.state);
    } catch (error) { $('status').textContent = error.message; }
    finally { $('save').disabled = false; }
  });
  load();
})();
