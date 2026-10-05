const fs = require('node:fs');
function mockChrome(window, initial = {}) {
  const data = {...initial}, changes = [], messages = [];
  const chrome = {
    runtime: {id:'calstack-test', onMessage:{addListener:listener => messages.push(listener)}},
    storage: {
      local: {get:async key => ({[key]:data[key]}), set:async values => {
        const delta = {};
        for (const [key, value] of Object.entries(values)) {delta[key] = {oldValue:data[key],newValue:value}; data[key] = value;}
        for (const listener of changes) listener(delta,'local');
      }},
      onChanged:{addListener:listener => changes.push(listener)}
    }
  };
  window.chrome = chrome;
  window.eval(fs.readFileSync('extension/hints.js','utf8'));
  window.eval(fs.readFileSync('extension/content.js','utf8'));
  const message = (value, sender = {id:chrome.runtime.id}) => new Promise(resolve => {
    for (const listener of messages) {
      let sent = false;
      const async = listener(value,sender,result => {sent = true; resolve(result);});
      if (sent || async) return;
    }
    resolve(undefined);
  });
  return {data,message};
}
module.exports = {mockChrome};
