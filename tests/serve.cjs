const http = require('node:http');
const fs = require('node:fs');
const {body, uxBody} = require('./fixture.cjs');
const styles = `<style>
body{font:14px system-ui;background:#f3f7f4;color:#203629;margin:24px}h1{margin-bottom:5px}button{padding:8px 14px;cursor:pointer;margin-right:8px}aside{display:flex;gap:24px;margin:20px 0}
.events{position:relative;height:300px;width:640px;background:white;border:1px solid #ccd8cf}
[data-eventchip]{position:absolute;box-sizing:border-box;background:#d8e9dd;border:1px solid #8bac93;border-radius:5px;padding:3px 4px;cursor:pointer;overflow:hidden;font-size:12px;line-height:16px}
.KcY3wb{display:flex;width:100%}.I0UMhf{min-width:0}
[data-stacked-layout-chip-container]{height:22px;padding:0;font-size:12px;overflow:hidden}
[data-stacked-layout-chip]{display:flex;position:relative;height:22px;padding:0 4px;align-items:center;line-height:20px}
.nHqeVd{display:block;min-width:0;width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.fixture-time{margin-right:4px;font-size:11px}
.XuJrye{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#result{padding:12px;border:1px solid #a8c1ae;background:#e0efe3;margin:14px 0;max-width:900px}#detail{margin-top:20px}
.ux{display:grid;grid-template-columns:360px 360px;gap:16px 24px}.ux h2{font-size:13px;margin:0 0 8px}.ux .events{width:360px;height:120px}.ux .short{height:48px}.ux .monthly{width:260px;height:44px}.ux .dark [data-eventchip]{background:#185abc;color:white;border-color:#185abc}.ux .light [data-eventchip]{background:#e8dcfd;color:#493760;border-color:#b5a8ca}
</style>`;
http.createServer((req,res)=>{
  const url = new URL(req.url,'http://127.0.0.1'), path = url.pathname;
  const view = path.match(/^\/calendar\/u\/0\/r\/(month|week|day)$/)?.[1];
  if(view){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>CalStack 検証 — ${view}</title>${styles}<link rel="stylesheet" href="/extension/content.css"><script src="/tests/browser.js"></script></head><body><h1>CalStack / ${view}</h1><p>実際のDOM構造をもとにした架空の予定による検証画面</p><nav><a href="/calendar/u/0/r/month">月</a> · <a href="/calendar/u/0/r/week">週</a> · <a href="/calendar/u/0/r/day">日</a> · <a href="/calendar/u/0/r/week?ux=1">印の見え方</a></nav><p><button id="verify">検証を実行</button><button id="on">まとめ表示</button><button id="off">通常表示</button></p><div id="result" role="status">準備中…</div>${url.searchParams.has('ux') ? uxBody() : body(view)}<script src="/extension/core.js"></script><script src="/extension/adapter.js"></script><script src="/extension/hints.js"></script><script src="/extension/content.js"></script></body></html>`);return;}
  const allowed = /^\/(extension\/(core\.js|adapter\.js|hints\.js|content\.js|content\.css)|tests\/browser\.js)$/.test(path);
  if(!allowed){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript; charset=utf-8');
  res.end(fs.readFileSync('.'+path));
}).listen(8765,'127.0.0.1',()=>process.stdout.write('CalStack検証: http://127.0.0.1:8765/calendar/u/0/r/week\n'));
