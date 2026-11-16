import { extractCreator } from './extract.js';
import { analyze } from './scoring.js';
const $ = s => document.querySelector(s);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? escape(u.href) : '#'; } catch { return '#'; } };
const date = s => new Date(s).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', hour12: false});
let capture, report, reports = [];
const isFull = new URLSearchParams(location.search).has('report');
async function readPage() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id) throw new Error('未找到当前网页，请打开 B站 UP 主主页。');
  const [execution] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: extractCreator});
  if (execution?.result?.error) throw new Error(execution.result.error);
  if (execution?.error) throw new Error(execution.error.message || '网页读取失败。请刷新主页后重试。');
  if (!execution?.result) throw new Error('网页读取失败。请确认正在浏览 B站 UP 主主页。');
  return execution.result;
}
function fail(error) {
  const message = error.message || String(error);
  $('#status').textContent = /Cannot access|cannot be scripted|extensions gallery|Missing host permission/i.test(message) ? '无法读取此页面。请打开 B站 UP 主主页，再点击浏览器工具栏的插件图标。' : message;
}
function preview() {
  const selected = $('input[name="mode"]:checked').value === 'selection';
  $('#selection-confirm').hidden = !selected;
  $('#public-confirm').checked = false;
  $('#selection-preview').textContent = capture?.selection || '没有选中文字。请关闭插件，在 UP 主主页选中公开文字后重新打开。';
}
function renderHistory() {
  $('#history-count').textContent = reports.length;
  $('#history-items').innerHTML = reports.length ? reports.map(r => `<button class="history-item" data-report="${escape(r.id)}">${escape(r.creator.name)} <b>· ${r.score} 分</b><small>${escape(date(r.createdAt))} · ${r.mode === 'selection' ? '选中文字' : '主页内容'}</small></button>`).join('') : '<p>暂无报告。完成分析后会保留最近 10 份。</p>';
  $('#clear-history').hidden = !reports.length;
  document.querySelectorAll('[data-report]').forEach(button => button.addEventListener('click', () => { const r = reports.find(r => r.id === button.dataset.report); if (r) render(r); }));
}
function render(r) {
  report = r;
  $('#status').textContent = '';
  $('#start').hidden = true;
  $('#result').hidden = false;
  $('#result').innerHTML = `
    <div class="eyebrow">SIGNAL REPORT / 公开内容分析</div>
    <div class="report-head"><h2>${escape(r.creator.name)}</h2><p>哔哩哔哩 · UID ${escape(r.creator.uid)} · <a href="${safeUrl(r.creator.url)}" target="_blank" rel="noopener noreferrer">查看创作者主页 ↗</a></p><p>${escape(date(r.createdAt))}（北京时间）</p></div>
    <div class="score-card"><div class="score-label">公开商业化信号指数</div><div class="score">${r.score}<span>/ 100</span></div><span class="level">${escape(r.level)}</span><p>分数越高，表示本次公开样本命中的商业化信号类别越多。</p></div>
    <div class="note">分析范围：${r.mode === 'selection' ? '用户选中的公开文字' : '主页简介与已加载作品标题'} · ${r.sample.blocks} 段 / ${r.sample.characters} 字。<br>类型：${escape(r.sample.types.join('、'))}。这不是全量作品分析。</div>
    <h3 class="section-title">分数从哪里来 <small>每类最多计分一次</small></h3>
    ${r.rules.map(rule => `<div class="rule"><div class="rule-head"><b>${escape(rule.name)}</b><span class="points">${rule.points} / ${rule.weight}</span></div><div class="track"><div class="fill" style="width:${rule.points ? 100 : 0}%"></div></div><p>${escape(rule.description)}</p>${rule.evidence.length ? rule.evidence.map(e=>`<blockquote>${escape(e.quote)}</blockquote><div class="evidence-source">命中「${escape(e.matched)}」 · ${escape(e.type)} · <a href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer">原文页面 ↗</a></div>`).join('') : '<p>本次样本未观察到可计分的明确表述。</p>'}${rule.excluded.length ? `<details><summary>已排除 ${rule.excluded.length} 条否定或风险提示表述</summary>${rule.excluded.map(e=>`<blockquote>${escape(e.quote)}</blockquote>`).join('')}</details>` : ''}</div>`).join('')}
    <details><summary>查看计算方式与分数含义</summary><div class="method"><p><b>公式：</b>指数 = 明确商务合作（35）+ 自有商品与付费服务（30）+ 内容赞助声明（25）+ 付费支持入口（10）。</p><p>每类存在至少一条明确且未被否定的关键词证据时获得该类全部分数，否则为 0。同一类多次出现不重复加分；没有使用粉丝数或播放量。</p><p>0：未观察到；1–34：少量信号；35–64：部分信号；65–100：多类信号。这些区间是产品规则，不是经过统计校准的行业标准。</p><p>按句匹配，含“不接商单”“无赞助”等否定句时保守排除整句。关键词可能漏报或误报，请结合原文核对。</p><p>规则版本：${escape(r.ruleVersion)}</p></div></details>
    <div class="note">${escape(r.limitation)}<br>本工具不推断个人收入、经济状况或私下意愿。</div>
    <div class="actions"><button class="secondary" id="export">导出报告 JSON</button>${!isFull ? '<button class="secondary" id="open-report">大屏查看 ↗</button><button class="text-button" id="again">返回</button>' : ''}</div>`;
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(report,null,2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `creator-signal-${report.creator.uid}-${report.id}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#again')?.addEventListener('click', () => { $('#result').hidden = true; $('#start').hidden = false; });
  $('#open-report')?.addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL(`popup.html?report=${encodeURIComponent(report.id)}`)}));
  window.scrollTo(0,0);
}
$('#analyze').addEventListener('click', async () => {
  $('#status').textContent = ''; const button = $('#analyze'); button.disabled = true; button.textContent = '正在读取公开内容…';
  try {
    const mode = $('input[name="mode"]:checked').value;
    if (mode === 'selection' && !$('#public-confirm').checked) throw new Error('请先确认选文由该 UP 主公开发布。');
    const fresh = await readPage();
    if (capture && fresh.creator.uid !== capture.creator.uid) throw new Error('页面已切换到其他 UP 主，请重新打开插件后分析。');
    if (mode === 'selection' && fresh.selection !== capture.selection) throw new Error('选中文字发生变化，请重新打开插件并确认选文。');
    const r = analyze(fresh, mode);
    const stored = await chrome.storage.local.get({reports: []});
    reports = [r, ...stored.reports].slice(0,10);
    await chrome.storage.local.set({reports}); renderHistory(); render(r);
  } catch(error) { fail(error); } finally {button.disabled = !capture; button.textContent = '分析这位 UP 主 ↗';}
});
document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', preview));
$('#clear-history').addEventListener('click', async () => {await chrome.storage.local.remove('reports'); reports=[]; renderHistory(); report=null; $('#result').hidden=true; $('#start').hidden=isFull; $('#status').textContent='本地报告已清空。';});
async function init() {
  try {
    ({reports} = await chrome.storage.local.get({reports:[]})); renderHistory();
    if (isFull) {
      document.body.classList.add('full'); $('#start').hidden = true;
      const r = reports.find(r => r.id === new URLSearchParams(location.search).get('report'));
      if (!r) throw new Error('这份报告已被清理或被最近 10 份记录替换，请返回 UP 主主页重新分析。');
      render(r); return;
    }
    capture = await readPage();
    $('#creator-name').textContent = capture.creator.name;
    $('#creator-detail').textContent = `UID ${capture.creator.uid} · 可读取 ${capture.blocks.length} 段公开文字`;
    $('#selection-hint').textContent = capture.selection ? `已选 ${capture.selection.length} 字` : '在主页选中公开文字';
    $('#analyze').disabled = false;
    if (!capture.blocks.length && capture.selection) $('input[value="selection"]').checked = true;
    preview();
  } catch(error) {$('#creator-name').textContent='请先打开 UP 主主页'; fail(error);}
}
init();
