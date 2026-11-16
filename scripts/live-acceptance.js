import {launch} from './browser-helper.js';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
process.env.HEADED ??= '1';
const {context,id,openPopup}=await launch();
try {
  await mkdir('docs/acceptance',{recursive:true});
  const page=await context.newPage();
  await page.goto('https://space.bilibili.com/163637592',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.nickname').waitFor({timeout:60000});
  await page.locator('.header-sign').waitFor();
  await page.waitForTimeout(5000);
  console.log('Live profile loaded');
  await page.screenshot({timeout:15000,path:'docs/acceptance/01-live-profile.png'});
  console.log('Video title markup:',await page.locator('a[href*="/video/"]').evaluateAll(es=>es.filter(e=>e.innerText.includes('【')).slice(0,2).map(e=>e.parentElement.outerHTML.slice(0,800))));
  const popup=await openPopup(page);
  await popup.waitFor('!document.querySelector("#analyze").disabled');
  await popup.screenshot('docs/acceptance/02-plugin-start.png');
  await popup.click('#analyze');
  await popup.waitFor('!document.querySelector("#result").hidden');
  const [report]=await popup.evaluate('chrome.storage.local.get("reports").then(x=>x.reports)');
  assert.equal(report.creator.uid,'163637592');
  assert.equal(report.creator.name,'老师好我叫何同学');
  assert.ok(report.rules[0].evidence.some(e=>e.matched==='合作请联系'));
  assert.equal(report.score,35);
  await popup.screenshot('docs/acceptance/03-plugin-result.png');
  await writeFile('docs/acceptance/live-report.json',JSON.stringify(report,null,2)+'\n');
  // Open persisted report through the UI and inspect the actual result tab.
  const tabPromise=context.waitForEvent('page');await popup.click('#open-report');const full=await tabPromise;
  await full.waitForURL(`chrome-extension://${id}/popup.html?report=*`);
  await full.locator('#result:not([hidden])').waitFor();
  assert.match(await full.locator('#result').innerText(),/35/);
  await full.screenshot({path:'docs/acceptance/04-full-report.png',fullPage:true,timeout:15000});
  console.log(JSON.stringify({creator:report.creator,score:report.score,sample:report.sample,ruleVersion:report.ruleVersion,analyzedAt:report.createdAt,flow:'真实B站页面 → 工具栏插件 → 点击分析 → 报告 → 大屏查看：通过'},null,2));
} finally {await context.close();}
