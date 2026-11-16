import { extractCreator } from './extract.js';
import { analyze, LEVELS } from './scoring.js';
const $ = s => document.querySelector(s);
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? escape(u.href) : '#'; } catch { return '#'; } };
const date = s => new Date(s).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',hour12:false});
const shortDate = s => new Date(s).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
const isFull = new URLSearchParams(location.search).has('report');
const descriptions = ['已读取样本中暂未发现合格的品牌合作证据。','有合作联系方式，尚未明确商务性质。','有明确商务说明，不等于已核验实际成交。','发现可定位作品的明确合作披露。'];
let capture, report, reports = [], busy = false;
async function readPage() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) throw new Error('未找到当前网页，请打开 B站 UP 主主页。');
  const [execution] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:extractCreator});
  if (execution?.result?.error) throw new Error(execution.result.error);
  if (execution?.error) throw new Error(execution.error.message || '网页读取失败，请刷新主页后重试。');
  if (!execution?.result) throw new Error('网页读取失败，请确认正在浏览 B站 UP 主主页。');
  return execution.result;
}
function fail(error) {
  const message = error.message || String(error);
  $('#status').textContent = /Cannot access|cannot be scripted|extensions gallery|Missing host permission/i.test(message)
    ? '无法读取此页面。请打开 B站 UP 主主页，再点击浏览器工具栏的插件图标。' : message;
}
function updateAnalyze() {
  const selected = $('input[name="mode"]:checked').value === 'selection';
  $('#analyze').disabled = busy || !capture || (selected && ((capture.selection?.length || 0) < 8 || !$('#public-confirm').checked));
  $('#analyze').setAttribute('aria-busy',String(busy));
}
function preview() {
  const selected = $('input[name="mode"]:checked').value === 'selection';
  $('#selection-confirm').hidden = !selected;
  $('#public-confirm').checked = false;
  $('#public-confirm').disabled = (capture?.selection?.length || 0) < 8;
  $('#selection-preview').textContent = capture?.selection || '尚未选中文字。关闭插件，在 UP 主主页选中至少 8 个字后重新打开。';
  $('#mode-help').textContent = selected ? '仅判断这段选文，确认内容归属后即可开始。' : '仅分析当前页面已显示的文字，每条结论附原文来源。';
  updateAnalyze();
}
function renderHistory() {
  $('#history-count').textContent = reports.length;
  $('#history-items').innerHTML = reports.length ? reports.map(r=>`<button class="history-item" data-report="${escape(r.id)}"><span class="history-name">${escape(r.creator.name)}<small>${escape(shortDate(r.createdAt))} · ${r.mode === 'selection' ? '选文分析' : '主页分析'}</small></span><span class="history-grade">${escape(r.schemaVersion === 2 ? r.assessment.code : '旧版')}</span></button>`).join('') : '<p class="empty-history">分析完成后，最近 10 份报告会保存在这里。</p>';
  $('#clear-history').hidden = !reports.length;
  $('#clear-confirm').hidden = true;
  document.querySelectorAll('[data-report]').forEach(button=>button.addEventListener('click',()=>{
    const r=reports.find(r=>r.id===button.dataset.report); if(r)render(r);
  }));
}
function renderEvidence(items) {
  return items.map(e=>`<blockquote>${escape(e.quote)}</blockquote><p class="reason">${escape(e.reason)}</p><div class="evidence-source"><span>${escape(e.type)}</span><span>·</span><a href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer">原文页面 ↗</a></div>${e.publishedAt || e.historical ? `<small class="source-meta">${e.publishedAt ? escape(date(e.publishedAt)) : ''}${e.historical ? ' 历史表述，不用于判断当前合作状态' : ''}</small>` : ''}`).join('');
}
function reportActions() {
  return `<div class="report-tools">${!isFull ? '<button class="secondary emphasis" id="open-report">完整报告 ↗</button>' : ''}<button class="secondary" id="export">导出 JSON</button>${!isFull ? '<button class="text-button" id="again">重新分析</button>' : ''}</div>`;
}
function render(r) {
  report=r; $('#status').textContent=''; $('#notice').textContent=''; $('#recovery').hidden=true; $('#start').hidden=true; $('#result').hidden=false;
  const heading=`<div class="eyebrow">ANALYSIS / ${r.mode === 'selection' ? '选文分析' : '主页分析'}</div><div class="report-head"><div><h2>${escape(r.creator.name)}</h2><p>UID ${escape(r.creator.uid)} · <a href="${safeUrl(r.creator.url)}" target="_blank" rel="noopener noreferrer">B站主页 ↗</a></p></div><small class="source-meta">${escape(shortDate(r.createdAt))}</small></div>${reportActions()}`;
  if(r.schemaVersion!==2) {
    $('#result').innerHTML=`${heading}<div class="note legacy"><b>旧版报告 · 计分规则已停用</b><p>这份报告使用旧的加权规则，无法直接转换为 E0–E3。请返回 UP 主主页重新分析。原始报告保留，可导出查看。</p></div>`;
  } else {
    const caution=['declined','conflict'].includes(r.cooperation.code);
    $('#result').innerHTML=`${heading}
      <div class="score-card"><div class="score-topline"><span>品牌合作公开证据等级</span><button class="score-rule-link" id="show-method">项目规则 ↗</button></div><div class="assessment-main"><div class="score">${escape(r.assessment.code)}</div><div class="assessment-text"><b>${escape(r.assessment.label)}</b><span>${escape(descriptions[r.assessment.level])}</span></div></div></div>
      <div class="cooperation-strip status-card ${caution ? 'attention' : ''}"><div class="strip-row"><small>${r.mode === 'selection' ? '选文合作表述' : '公开合作状态'}</small><b class="status-label">${escape(r.cooperation.label)}</b></div>${caution ? `<p>历史合作披露与当前接单声明分别判断。</p>${renderEvidence(r.cooperation.evidence)}` : ''}</div>
      <p class="sample-line">${r.mode === 'selection' ? '仅这一段选文' : '主页简介与已加载标题'} · ${r.sample.blocks} 段文字 · ${r.sample.characters} 字</p>
      <h3 class="section-title">可核对的依据 <small>${r.evidence.length ? `${r.evidence.length} 条正向证据` : '限定本次样本'}</small></h3>
      ${r.evidence.length ? r.evidence.slice(0,12).map((e,i)=>`<div class="rule"><div class="rule-head"><span>${String(i+1).padStart(2,'0')} / ${escape(LEVELS[e.level].label)}</span><span class="points">E${e.level}</span></div>${renderEvidence([e])}</div>`).join('') : '<p class="reason">已读取的样本中未发现合格的正向证据。这不代表创作者没有商业合作。</p>'}
      ${r.excluded.length ? `<details class="exclusions"><summary>已排除或需核对的表述 <span>${r.excluded.length} 条</span></summary>${renderEvidence(r.excluded)}</details>` : ''}
      <h3 class="section-title">观察到的变现渠道 <small>独立记录，不提高等级</small></h3>
      ${r.channels.length ? r.channels.map(c=>`<details class="channel"><summary>${escape(c.name)}</summary>${renderEvidence(c.evidence)}</details>`).join('') : '<p class="reason">本次未观察到作者主动说明的渠道；平台通用按钮不作为依据。</p>'}
      <details class="disclosure-info"><summary>商业合作披露率 <span class="summary-hint">暂无法计算</span></summary><div class="method"><p>${escape(r.disclosureRate.reason)}</p><p>未读取的内容没有被当成“无合作”。完整采样后，才能计算明确披露合作的视频占比。</p></div></details>
      <details class="scope-details"><summary>本次范围：${r.mode === 'selection' ? '仅这一段选文' : '主页简介与作品标题'} · ${r.sample.blocks} 段文字</summary><div class="method"><p>${r.sample.characters} 字 · 可定位 ${r.sample.linkedWorks} 个作品链接。<b>文字段数不等于完整视频数。</b></p><p>${r.mode === 'selection' ? '本次仅判断用户确认的选文，不代表整个账号。' : '只读取本页已加载的简介与作品标题，不自动翻页。'}未完整分析视频简介、画面或语音。</p><p>采集时间：${escape(date(r.capturedAt))}（北京时间）。未获取发布日期时，不能将采集时间当成声明的发布时间。</p></div></details>
      <details id="method"><summary>等级规则与计算方式</summary><div class="method"><p><b>取有效证据支持的最高 E 等级。</b>不加权、不累加，不换算为百分制或合作概率。</p>${LEVELS.map(l=>`<p class="${l.level===r.assessment.level ? 'active-definition' : ''}"><b>${l.code} · ${escape(l.label)}</b><br>${escape(l.description)}</p>`).join('')}<p>否定、疑问、教程、转述、假设和风险提示保守排除。合作声明有冲突时显示待核对；复杂语境仍需回看原文。</p><p>规则版本：${escape(r.ruleVersion)}</p></div></details>
      <details><summary>数据来源与判断边界</summary><div class="method"><p>分析时间：${escape(date(r.createdAt))}（北京时间）。来源类型：${escape(r.sample.types.join('、'))}。</p><p>${escape(r.cooperation.scope)}。历史披露不代表当前接受合作；主页保留的声明也不保证实际接单状态。</p><p>电磁力、花火后台数据和第三方指数未获取，不作估算。</p><p>${escape(r.limitation)}</p></div></details>`;
    $('#show-method').addEventListener('click',()=>{$('#method').open=true;$('#method').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('#method').querySelector('summary').focus({preventScroll:true});});
  }
  $('#export').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`creator-signal-${report.creator.uid}-${report.id}.json`;a.click();
    const button=$('#export');button.textContent='下载已发起';setTimeout(()=>{URL.revokeObjectURL(url);button.textContent='导出 JSON';},1500);
  });
  $('#again')?.addEventListener('click',()=>{$('#result').hidden=true;$('#start').hidden=false;$('#notice').textContent='';updateAnalyze();});
  $('#open-report')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL(`popup.html?report=${encodeURIComponent(report.id)}`)}));
  window.scrollTo(0,0);
}
$('#analyze').addEventListener('click',async()=>{
  $('#status').textContent='';busy=true;updateAnalyze();$('#analyze').textContent='正在分析公开内容…';
  try {
    const mode=$('input[name="mode"]:checked').value;
    if(mode==='selection'&&!$('#public-confirm').checked)throw new Error('请先确认选文由该 UP 主公开发布。');
    const fresh=await readPage();
    if(capture&&fresh.creator.uid!==capture.creator.uid)throw new Error('页面已切换到其他 UP 主，请重新打开插件后分析。');
    if(mode==='selection'&&fresh.selection!==capture.selection)throw new Error('选中文字发生变化，请重新打开插件并确认选文。');
    const r=analyze(fresh,mode),stored=await chrome.storage.local.get({reports:[]});
    reports=[r,...stored.reports].slice(0,10);await chrome.storage.local.set({reports});renderHistory();render(r);
  }catch(error){fail(error);}finally{busy=false;$('#analyze').innerHTML='开始分析 <span>→</span>';updateAnalyze();}
});
document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener('change',preview));
$('#public-confirm').addEventListener('change',updateAnalyze);
$('#clear-history').addEventListener('click',()=>{$('#clear-question').textContent=`清空本机的 ${reports.length} 份报告？已导出的文件不受影响。`;$('#clear-history').hidden=true;$('#clear-confirm').hidden=false;});
$('#cancel-clear').addEventListener('click',()=>{$('#clear-confirm').hidden=true;$('#clear-history').hidden=!reports.length;});
$('#confirm-clear').addEventListener('click',async()=>{
  await chrome.storage.local.remove('reports');reports=[];renderHistory();report=null;$('#result').hidden=true;$('#start').hidden=isFull;$('#notice').textContent='本地报告已清空。';
});
$('#retry').addEventListener('click',()=>init());
async function init() {
  $('#status').textContent='';$('#recovery').hidden=true;
  try {
    ({reports}=await chrome.storage.local.get({reports:[]}));renderHistory();
    if(isFull){
      document.body.classList.add('full');$('#start').hidden=true;
      const r=reports.find(r=>r.id===new URLSearchParams(location.search).get('report'));
      if(!r)throw new Error('这份报告已被清理或被最近 10 份记录替换，请返回 UP 主主页重新分析。');render(r);return;
    }
    capture=await readPage();$('#creator').classList.add('ready');$('#creator-state').textContent='已识别创作者';
    $('#creator-name').textContent=capture.creator.name;$('#creator-detail').textContent=`UID ${capture.creator.uid} · 已读取 ${capture.blocks.length} 段公开文字`;
    $('#selection-hint').textContent=capture.selection ? `已选 ${capture.selection.length} 字` : '先在主页选择文字';
    if(!capture.blocks.length&&capture.selection)$('input[value="selection"]').checked=true;preview();
  }catch(error){
    capture=null;$('#creator').classList.remove('ready');$('#creator-state').textContent='尚未识别';$('#creator-name').textContent='还没有找到 UP 主';$('#creator-detail').textContent='打开 B站个人空间后重试';$('#recovery').hidden=isFull;updateAnalyze();fail(error);
  }
}
init();
