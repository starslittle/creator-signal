import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {launch} from '../scripts/browser-helper.js';
let browser;
test.beforeAll(async()=>{browser=await launch();});
test.afterAll(async()=>{await browser?.context.close();});
async function fixture(html,url='https://space.bilibili.com/123') {
  const page=await browser.context.newPage();
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto(url);return page;
}
const html=await readFile(new URL('./fixtures.html',import.meta.url),'utf8');
test('真实插件权限下：识别作者、计分、证据、导出、独立报告与清空',async()=>{
  const page=await fixture(html);const popup=await browser.openPopup(page);
  await popup.waitFor('!document.querySelector("#analyze").disabled');
  expect(await popup.evaluate('document.querySelector("#creator-name").textContent')).toBe('示例创作者');
  await popup.click('#analyze');await popup.waitFor('!document.querySelector("#result").hidden');
  const reports=await popup.evaluate('chrome.storage.local.get("reports").then(x=>x.reports)');
  expect(reports[0].score).toBe(90); // comment "为我充电" must not count.
  expect(reports[0].rules[3].points).toBe(0);
  expect(reports[0].creator.uid).toBe('123');
  expect(await popup.evaluate('document.querySelector("#result").innerText')).toContain('原文页面');
  const full=await browser.context.newPage();await full.goto(`chrome-extension://${browser.id}/popup.html?report=${reports[0].id}`);
  await expect(full.locator('#result')).toBeVisible();
  const downloadPromise=full.waitForEvent('download');await full.locator('#export').click();const download=await downloadPromise;
  const {readFile}=await import('node:fs/promises');
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));expect(exported.id).toBe(reports[0].id);
  await full.locator('#history').evaluate(el=>el.open=true);await full.locator('#clear-history').click();
  await expect(full.locator('#status')).toHaveText('本地报告已清空。');
  await full.reload();await expect(full.locator('#status')).toContainText('报告已被清理');
  await full.close();await page.close();
});
test('选文必须确认且不会混入主页得分',async()=>{
  const page=await fixture(html.replace('</body>','<p id="chosen">给我充电，支持我的创作，谢谢大家</p></body>'));
  await page.locator('#chosen').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(range);});
  const popup=await browser.openPopup(page);await popup.waitFor('!document.querySelector("#analyze").disabled');
  await popup.click('input[value="selection"]');await popup.click('#analyze');
  await popup.waitFor('document.querySelector("#status").textContent.includes("确认")');
  await popup.click('#public-confirm');await popup.click('#analyze');
  await popup.waitFor('!document.querySelector("#result").hidden');
  expect((await popup.evaluate('chrome.storage.local.get("reports").then(x=>x.reports)'))[0].score).toBe(10);
  await popup.close();await page.close();
});
test('空样本展示错误，不伪造分析结果',async()=>{
  const page=await fixture('<title>空样本的个人空间</title><div class="nickname">空样本</div>');
  const popup=await browser.openPopup(page);await popup.waitFor('!document.querySelector("#analyze").disabled');await popup.click('#analyze');
  await popup.waitFor('document.querySelector("#status").textContent.includes("未读取")');
  expect(await popup.evaluate('document.querySelector("#result").hidden')).toBe(true);
  await popup.close();await page.close();
});
test('不支持的网站无法发起分析',async()=>{
  const page=await fixture(html,'https://example.com/123');const popup=await browser.openPopup(page);
  await popup.waitFor('document.querySelector("#status").textContent.includes("UP 主主页")');
  expect(await popup.evaluate('document.querySelector("#analyze").disabled')).toBe(true);
  await popup.close();await page.close();
});
test('未加载姓名的页面无法发起分析',async()=>{
  const page=await fixture('<title>哔哩哔哩</title><p>请先登录</p>');const popup=await browser.openPopup(page);
  await popup.waitFor('document.querySelector("#status").textContent.includes("尚未识别")');
  expect(await popup.evaluate('document.querySelector("#analyze").disabled')).toBe(true);
  await popup.close();await page.close();
});
test('选中评论不会进入可分析的选文',async()=>{
  const page=await fixture(html);await page.locator('.comment').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);window.getSelection().addRange(r);});
  const popup=await browser.openPopup(page);await popup.waitFor('!document.querySelector("#analyze").disabled');await popup.click('input[value="selection"]');
  expect(await popup.evaluate('document.querySelector("#selection-preview").textContent')).toContain('没有选中文字');
  await popup.close();await page.close();
});
