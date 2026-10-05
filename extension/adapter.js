(function (root) {
  'use strict';
  const core = root.CalStackCore;
  function decode(value) {
    try { return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); }
    catch { return null; }
  }
  function account(document) {
    for (const element of document.querySelectorAll('[aria-label]')) {
      const label = element.getAttribute('aria-label');
      if (!/Google (?:アカウント|Account)/i.test(label)) continue;
      const email = label.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
      if (email) return email.toLowerCase();
    }
    return null;
  }
  function calendarId(element) {
    const raw = element.getAttribute('jslog')?.match(/(?:^|;)\s*1:\["([^"\n]+)",/)?.[1];
    return raw || null;
  }
  function label(element) {
    const direct = element.getAttribute('aria-label');
    if (direct?.includes('、カレンダー: ')) return direct;
    for (const child of element.querySelectorAll('.XuJrye, [aria-label]')) {
      const value = child.getAttribute('aria-label') || child.textContent;
      if (value?.includes('、カレンダー: ')) return value.trim();
    }
    // 補助テキストのクラス名だけが変更された場合も、説明文の内容で識別する。
    for (const child of element.querySelectorAll('span, div')) {
      if (!child.children.length && !child.closest('[aria-hidden="true"]') && child.textContent.includes('、カレンダー: ')) return child.textContent.trim();
    }
    return null;
  }
  function shown(element) {
    return element.getClientRects().length > 0 && !element.closest('[hidden], [aria-hidden="true"]');
  }
  function titleParts(event) {
    if (!event.button) return null;
    const titles = [...event.button.querySelectorAll('.I0UMhf, .WBi6vc')]
      .filter(element => element.textContent.trim() === event.title);
    if (titles.length !== 1) return null;
    const text = titles[0], row = text.parentElement;
    return row?.matches('.KcY3wb, .nHqeVd') ? {text, row} : null;
  }
  function scan(document) {
    const events = []; let unreadable = 0;
    for (const element of document.querySelectorAll('[data-eventchip]')) {
      if (!shown(element)) continue;
      const eventLabel = label(element);
      // タスクは重複判定対象に含めないが、配置処理では枠として保持する。
      if (!eventLabel) {
        if (!element.getAttribute('data-eventid')?.startsWith('tasks_')) unreadable++;
        continue;
      }
      const parsed = core.parseLabel(eventLabel);
      const id = calendarId(element), eventId = element.getAttribute('data-eventid');
      if (!parsed || !id || !eventId) { unreadable++; continue; }
      events.push({...parsed, calendarId: id, eventId, element, label: eventLabel,
        button: element.matches('[role="button"]') ? element : element.querySelector('[role="button"]')});
    }
    const calendars = new Map();
    const names = new Map();
    for (const input of document.querySelectorAll('input[type="checkbox"][aria-label]')) {
      const holder = input.closest('[data-id]');
      const id = decode(holder?.getAttribute('data-id') || '');
      if (!id?.includes('@')) continue;
      const name = input.getAttribute('aria-label');
      calendars.set(id, {id, name, visible: input.checked});
      if (!names.has(name)) names.set(name, new Set());
      names.get(name).add(id);
    }
    for (const event of events) {
      if (!calendars.has(event.calendarId)) calendars.set(event.calendarId, {id: event.calendarId, name: event.calendarName, visible: true});
      if (!names.has(event.calendarName)) names.set(event.calendarName, new Set());
      names.get(event.calendarName).add(event.calendarId);
    }
    return {events, unreadable, calendars: [...calendars.values()].map(c => ({...c, duplicateName: names.get(c.name)?.size > 1}))};
  }
  // Googleが再描画した属性値は復元で上書きしない。
  class Changes {
    constructor() { this.attributes = []; this.styles = []; this.nodes = []; }
    attr(element, name, value) {
      const before = element.getAttribute(name);
      if (before === value) return;
      element.setAttribute(name, value);
      this.attributes.push({element, name, before, after: value});
    }
    style(element, name, value) {
      const before = element.style.getPropertyValue(name), priority = element.style.getPropertyPriority(name);
      if (before === value && priority === 'important') return;
      element.style.setProperty(name, value, 'important');
      this.styles.push({element, name, before, priority, after: element.style.getPropertyValue(name)});
    }
    restore() {
      for (const node of this.nodes) node.remove();
      for (const {element, name, before, after} of this.attributes.reverse()) {
        if (element.getAttribute(name) !== after) continue;
        if (before === null) element.removeAttribute(name); else element.setAttribute(name, before);
      }
      for (const {element, name, before, priority, after} of this.styles.reverse()) {
        if (element.style.getPropertyValue(name) !== after || element.style.getPropertyPriority(name) !== 'important') continue;
        if (before) element.style.setProperty(name, before, priority); else element.style.removeProperty(name);
      }
      this.attributes = []; this.styles = []; this.nodes = [];
    }
    merge(pair) {
      if (!pair.personal.every(titleParts)) return false;
      for (const event of pair.company) {
        this.style(event.element, 'display', 'none');
        this.attr(event.element, 'aria-hidden', 'true');
      }
      for (const event of pair.personal) this.annotate(event, pair.company[0].calendarName);
      return true;
    }
    annotate(event, companyName, checkedAt = null) {
      const parts = titleParts(event);
      if (!parts) return false;
      const document = event.element.ownerDocument, ns = 'http://www.w3.org/2000/svg';
      const badge = document.createElement('span');
      badge.className = 'calstack-badge';
      badge.setAttribute('aria-hidden', 'true');
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('focusable', 'false');
      for (const [name, offset] of [['back', '1.5'], ['front', '5.5']]) {
        const rect = document.createElementNS(ns, 'rect');
        for (const [key, value] of Object.entries({class: 'calstack-' + name, x: offset, y: offset, width: '8.5', height: '8.5', rx: '1.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5'})) rect.setAttribute(key, value);
        svg.append(rect);
      }
      badge.append(svg);
      let description = `会社カレンダーとタイトル・日時が一致しています（${companyName}）。`;
      if (checkedAt) {
        description = `会社カレンダー：${companyName}。会社側は非表示のため、現在の変更・削除は未確認です。`;
        badge.setAttribute('data-calstack-cached', 'true');
      }
      description += ' クリックすると自分の予定を開きます。';
      this.attr(parts.row, 'data-calstack-title-row', 'true');
      this.attr(parts.text, 'data-calstack-title-text', 'true');
      this.attr(event.button, 'data-calstack-hint', description);
      this.attr(event.button, 'aria-label', (event.button.getAttribute('aria-label') || event.label) + '。' + description);
      parts.row.append(badge); this.nodes.push(badge);
      return true;
    }
  }
  function layout(document, hidden, changes) {
    const all = [...document.querySelectorAll('[data-eventchip]')];
    const container = e => e.hasAttribute('data-stacked-layout-chip-container') ? e.closest('[role="row"]') || e.parentElement : e.parentElement;
    const parents = new Set([...hidden].map(container));
    for (const parent of parents) {
      const children = all.filter(e => container(e) === parent && shown(e));
      const timed = children.filter(e => !e.hasAttribute('data-stacked-layout-chip-container'));
      if (timed.length) {
        // 不明な要素の位置はそのまま。縦の表示枠全体が取れる集合だけを再配置する。
        const boxes = timed.map(element => ({element, start: parseFloat(element.style.top), end: parseFloat(element.style.top) + parseFloat(element.style.height)}));
        if (boxes.every(b => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start && /px$/.test(b.element.style.top) && /px$/.test(b.element.style.height))) {
          const remaining = boxes.filter(b => !hidden.has(b.element));
          for (const item of core.columns(remaining)) {
            changes.style(item.event.element, 'left', `calc(${item.left}% + 0px)`);
            changes.style(item.event.element, 'width', `calc(${item.width}% - 2px)`);
          }
        }
      }
      const stacked = children.filter(e => e.hasAttribute('data-stacked-layout-chip-container'));
      if (stacked.length) {
        const boxes = stacked.map(element => ({element, left: parseFloat(element.style.left), width: parseFloat(element.style.width), row: parseFloat(element.style.top)}));
        if (boxes.every(b => [b.left, b.width, b.row].every(Number.isFinite) && /%$/.test(b.element.style.left) && /%$/.test(b.element.style.width) && /em$/.test(b.element.style.top))) {
          for (const {item, row} of core.packRows(boxes.filter(b => !hidden.has(b.element)))) changes.style(item.element, 'top', `${row}em`);
        }
      }
    }
  }
  root.CalStackAdapter = {account, scan, label, calendarId, titleParts, Changes, layout};
})(globalThis);
