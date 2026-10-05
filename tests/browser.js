(() => {
  const accountKey = 'account:owner@example.com';
  const settings = {companyId:'company@example.com',personalId:'personal@example.com',enabled:false};
  const data = {[accountKey]:settings}, messages = [], updates = [];
  window.chrome = {
    runtime:{id:'calstack-test',onMessage:{addListener:fn=>messages.push(fn)}},
    storage:{local:{get:async key=>({[key]:data[key]}),set:async values=>{
      const delta={}; for(const [key,value] of Object.entries(values)){delta[key]={newValue:value};data[key]=value;}
      updates.forEach(fn=>fn(delta,'local'));
    }},onChanged:{addListener:fn=>updates.push(fn)}}
  };
  const send = message => new Promise(resolve=>messages.forEach(fn=>fn(message,{id:'calstack-test'},resolve)));
  const set = enabled => send({type:'calstack:settings',account:'owner@example.com',settings:{...settings,enabled}});
  window.addEventListener('DOMContentLoaded', () => {
    const companyBox=document.querySelector('input[aria-label="会社"]');
    companyBox.addEventListener('change',()=>{
      for(const e of document.querySelectorAll('[data-eventchip]'))if(e.getAttribute('jslog').includes('company@example.com'))e.style.setProperty('display',companyBox.checked?'':'none');
    });
    for (const e of document.querySelectorAll('[data-eventchip]')) e.addEventListener('click',()=>{document.getElementById('detail').textContent=`詳細を開いた予定: ${e.dataset.eventid}（${e.dataset.eventid.startsWith('p')?'自分':'会社'}）`;});
    document.getElementById('on').addEventListener('click',async()=>{await set(true);await display();});
    document.getElementById('off').addEventListener('click',async()=>{await set(false);await display();});
    async function display(){const s=await send({type:'calstack:state'});document.getElementById('result').textContent=s.message;}
    document.getElementById('verify').addEventListener('click',async()=>{
      const assert=(value,text)=>{if(!value)throw new Error(text);};
      const c=document.querySelector('[data-eventid=c1]'), p=document.querySelector('[data-eventid=p1]');
      const steps=[];
      try {
        await set(true); assert(c.style.display==='none','重複が残っています'); steps.push('重複を1つに統合');
        const combined=await send({type:'calstack:state'});
        assert(p.querySelector('.calstack-badge'),'印がありません'); steps.push('自分側に印を表示');
        const uncopied=document.querySelector('[data-eventid=uncopied]')||document.querySelector('[data-eventid=c2]');
        assert(uncopied.style.display!=='none','未コピーが消えました'); steps.push('未コピーの会社予定を保持');
        p.click(); assert(document.getElementById('detail').textContent.includes('p1'),'詳細が違います'); steps.push('自分の詳細を開く');
        await set(false); assert(c.style.display===''&&!document.querySelector('.calstack-badge'),'復元に失敗'); steps.push('無効化で復元');
        await set(true);
        companyBox.click();
        const cached=await send({type:'calstack:state'});
        assert(cached.cached&&cached.merged===combined.merged&&p.querySelector('.calstack-badge'),'会社非表示後の印がありません');
        steps.push('会社を隠しても印を保持');
        document.getElementById('result').textContent='成功: '+steps.join(' / ');
        document.getElementById('result').dataset.passed='true';
      } catch(error) {document.getElementById('result').textContent='失敗: '+error.message;}
    });
    display();
  });
})();
