import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function launch() {
  const extension=resolve('extension');
  const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:process.env.HEADED !== '1',viewport:{width:1360,height:960},args:['--enable-unsafe-extension-debugging',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const cdp=await context.browser().newBrowserCDPSession();
  const {extensions}=await cdp.send('Extensions.getExtensions');
  const id=extensions.find(e=>e.name==='知创 · 创作者信号').id;
  async function openPopup(page) {
    await page.bringToFront();
    const {targetInfos}=await cdp.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
    const target=targetInfos.find(t=>t.url===page.url());
    if(!target) throw new Error(`No tab target for ${page.url()}`);
    await cdp.send('Extensions.triggerAction',{id,targetId:target.targetId});
    let popupTarget;
    for(let i=0;i<50;i++) {
      const {targetInfos}=await cdp.send('Target.getTargets');
      popupTarget=targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`);
      if(popupTarget) break;
      await new Promise(r=>setTimeout(r,100));
    }
    if(!popupTarget) throw new Error('Extension popup did not open');
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:popupTarget.targetId,flatten:false});
    let seq=0; const pending=new Map();
    const listener=event=>{if(event.sessionId!==sessionId)return;const msg=JSON.parse(event.message);const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);}};
    cdp.on('Target.receivedMessageFromTarget',listener);
    const send=(method,params={})=>new Promise((resolve,reject)=>{const messageId=++seq;pending.set(messageId,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:messageId,method,params})}).catch(reject);});
    const popup={
      async evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result?.value;},
      async click(selector){return this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);},
      async waitFor(expression){for(let i=0;i<100;i++){if(await this.evaluate(`(()=>{try{return (${expression});}catch{return false;}})()`))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out waiting for '+expression+'; '+await this.evaluate('document.body.innerText'));},
      async screenshot(path){const {data}=await send('Page.captureScreenshot',{captureBeyondViewport:true});await writeFile(path,Buffer.from(data,'base64'));},
      async close(){cdp.off('Target.receivedMessageFromTarget',listener);await cdp.send('Target.closeTarget',{targetId:popupTarget.targetId});}
    };
    return popup;
  }
  return {context,id,openPopup};
}
