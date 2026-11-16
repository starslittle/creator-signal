/** Evidence categories are product rules, not a calibrated probability or an official Bilibili score. */
export const RULE_VERSION = 'evidence-v2.0';
export const LEVELS = [
  { level: 0, code: 'E0', label: '本次未发现合格证据', description: '已读取样本中没有可支持更高等级的证据；不代表没有商业合作。' },
  { level: 1, code: 'E1', label: '发现合作联系线索', description: '作者提供合作联系方式，但尚未明确合作的商业性质。普通邮箱不算合作线索。' },
  { level: 2, code: 'E2', label: '发现明确商务合作声明', description: '作者明确提供商务、品牌推广合作，或明确自述品牌合作经历；不等于实际接单或当前仍接受邀约。' },
  { level: 3, code: 'E3', label: '发现具体作品的合作披露', description: '某件可定位的作品明确披露品牌赞助或商业合作。仅确认公开披露，未核验合同、交易或收入。' }
];
const videoId = url => {
  try { const u = new URL(url); return u.hostname === 'www.bilibili.com' && u.protocol === 'https:' ? u.pathname.match(/^\/video\/(BV[0-9a-z]+|av\d+)(?:\/|$)/i)?.[1] || null : null; } catch { return null; }
};
const CLUE = /合作(?:请|可)?联系|合作(?:邮箱|联络)|联系.{0,6}合作/;
const BUSINESS = /商务(?:合作|联系|咨询|洽谈|推广|邮箱|[：:])|商业合作|品牌合作|(?:接受|承接|可接|接)商单|广告(?:合作|投放)|推广合作/;
const DECLARATIVE = /联系|邮箱|邮件|@|洽谈|咨询|邀约|私信|承接|接受|欢迎|期待|寻求|征求|可接|接商单|提供|开放|接单|(?:商务合作|品牌合作|广告合作|推广合作)[：:]/;
const DECLINE = /(?:暂不|不再|从不|不接受|拒绝|谢绝|暂停|停止|不|勿).{0,8}(?:接.{0,3}(?:广告|商单|推广)|商务(?:合作)?|商业合作|品牌合作|广告合作|推广合作|商单)|(?:商务合作|品牌合作|商单|广告合作).{0,6}(?:暂停|停止|谢绝)/;
const HISTORICAL = /以前|过去|曾经|此前|之前|去年|当时|往年|历史/;
const NEGATIVE = /(?:无|没有|未|并非|并未|不是|非|不接受|拒绝|不).{0,6}(?:赞助|冠名|商务|商单|广告|商业合作|品牌合作)|无广|非商业|非广告|不含.{0,4}(?:推广|广告)|不涉及.{0,4}(?:商业|品牌|广告)/;
const CONTEXT = /例如|举例|教程|科普|案例分析|如何|怎么|有人说|有人问|对方说|他说|她说|转发|转载|假如|假设|如果|示例|不是本人|是否|能否|请问|[？?]|谨防|诈骗|冒充/;
const DISCLOSURE = [
  /(?:本期(?:视频)?|本视频|这期(?:视频)?|此视频|该视频|本次)(?:内容)?(?:由|与|和)([^，,。；;！!？?：:]{1,24}?)(?:联合)?(?:商业合作|品牌合作|合作推广|赞助|冠名|广告合作)/,
  /感谢([^，,。；;！!？?：:]{1,20}?)(?:对本期(?:视频)?的)?(?:赞助|冠名)/
];
const CHANNELS = [
  { id: 'shop', name: '商品与店铺', pattern: /(?:我的|本人的|本人|自营).{0,5}(?:淘宝店|天猫店|微店|小店|店铺|商店)|(?:淘宝店|天猫店|微店|小店|店铺).{0,8}(?:已开|开业|上线|地址|链接)|购买链接|下单链接|带货橱窗/, negative: /(?:不|无|没有|停止|暂停|不做).{0,6}(?:店铺|小店|带货|下单)|谨防|冒充|诈骗/ },
  { id: 'paid', name: '付费内容与服务', pattern: /付费(?:课程|咨询|服务|社群|专栏)|课程购买|购买.{0,4}课程/, negative: /免费|(?:不|没有|暂停|停止).{0,6}(?:付费|购买|课程)/ },
  { id: 'support', name: '创作支持与会员', pattern: /为我充电|给我充电|充电支持|充电专属|付费会员|打赏支持|支持我的创作|赞赏支持/, negative: /(?:不|勿|无需|不用|拒绝|停止).{0,6}(?:充电|付费|打赏|赞赏|支持)/ }
];
export function analyze(capture, mode = 'page') {
  if (!['page', 'selection'].includes(mode)) throw new Error('不支持的分析模式。');
  if (!capture.creator?.uid || !capture.creator?.name) throw new Error('缺少可验证的创作者身份，无法判断。');
  if (mode === 'selection' && (capture.selection?.trim().length || 0) < 8) throw new Error('请先在 UP 主主页选中至少 8 个字的公开内容，再打开插件。');
  const blocks = mode === 'selection'
    ? [{ text: capture.selection.trim(), type: '用户确认的公开选文', url: capture.selectionSource?.url || capture.pageUrl, publishedAt: null }]
    : capture.blocks;
  const unique = [...new Map((blocks || []).filter(b => b.text?.trim()).map(b => [JSON.stringify([b.type,b.url,b.text]), b])).values()];
  if (!unique.length) throw new Error('无法判断：未读取到简介或作品标题。请等待加载，或选择主页中的公开文字后分析。');
  const evidence = [], excluded = [], channels = new Map(), open = [], declined = [], clues = [];
  const seen = new Set();
  function item(block, clause, match, reason, kind, level) {
    const start = Math.max(0, (match?.index || 0) - 40);
    return { kind, level, quote: clause.slice(start, start + 200), matched: match?.[0] || '', reason, type: block.type, url: block.url,
      creatorUid: capture.creator.uid, contentId: videoId(block.url), publishedAt: block.publishedAt || null, capturedAt: capture.capturedAt, historical: HISTORICAL.test(clause) };
  }
  function add(e) {
    const key = JSON.stringify([e.kind,e.url,e.quote]);
    if (!seen.has(key)) {seen.add(key); evidence.push(e);}
  }
  for (const block of unique) {
    const work = videoId(block.url);
    const profile = block.type === '主页简介' || (mode === 'selection' && !work);
    // Keep clauses separate so “不做带货；商务合作请联系” does not lose valid evidence.
    const clauses = block.text.split(/(?<=[。！？!?])|[\n；;｜|，,]/u).map(s=>s.trim()).filter(Boolean);
    for (const clause of clauses) {
      const businessMatch = clause.match(BUSINESS);
      const business = businessMatch && DECLARATIVE.test(clause) ? businessMatch : null, clue = clause.match(CLUE);
      const disclosure = DISCLOSURE.map(p=>clause.match(p)).find(m=>m && !/^(?:品牌|某品牌|某个品牌)$/.test(m[1]) && !/大家|粉丝|观众|朋友|各位|你们|小伙伴|父母|爸爸|妈妈|家人/.test(m[1]));
      const decline = clause.match(DECLINE);
      const hasSignal = business || clue || disclosure || decline;
      if (CONTEXT.test(clause)) {
        if (hasSignal) excluded.push(item(block,clause,hasSignal,'教学、假设、转述或风险提示不作为本人商业证据。','context',0));
        continue;
      }
      if (decline || NEGATIVE.test(clause)) {
        const e = item(block,clause,decline || business || clue || disclosure,'否定或暂停表述，不提高正向证据等级。','negative',0);
        if (hasSignal || /赞助|广告|商务|商单/.test(clause)) excluded.push(e);
        if (profile && decline && !e.historical) declined.push(e);
      } else if (hasSignal) {
        if (disclosure) {
          const e = item(block,clause,disclosure,work ? '明确的合作披露，且有可定位的 B站作品链接；未核验交易真实性。' : '存在合作自述，但缺少可定位的具体作品，不能认定 E3。',work ? 'disclosure' : 'statement',work ? 3 : 2);
          add(e);
        } else if (business) {
          const e = item(block,clause,business,'作者文本明确提及商务、品牌或推广合作；这不是实际成交的证明。','statement',2);
          add(e);
        } else if (clue) add(item(block,clause,clue,'只有泛合作联系表述，商业性质尚不明确。','clue',1));
        // Titles and past sponsorships cannot establish a present willingness to take orders.
        if (profile && !HISTORICAL.test(clause) && !disclosure) {
          const e = item(block,clause,business || clue,business ? '主页保留明确商务合作声明；未验证实际接单状态。' : '有泛合作联系线索，不能直接推断商务意愿。',business ? 'statement' : 'clue',business ? 2 : 1);
          if (business) open.push(e); else if (clue) clues.push(e);
        }
      }
      for (const channel of CHANNELS) {
        const match = clause.match(channel.pattern);
        if (match && !channel.negative.test(clause)) {
          if (!channels.has(channel.id)) channels.set(channel.id,{id:channel.id,name:channel.name,evidence:[]});
          const list = channels.get(channel.id).evidence;
          if (list.length < 5 && !list.some(e=>e.quote===clause && e.url===block.url)) list.push(item(block,clause,match,'独立记录变现渠道，不提高品牌合作证据等级。','channel',null));
        }
      }
    }
  }
  const level = evidence.reduce((n,e)=>Math.max(n,e.level),0);
  let code = 'unknown', label = '本次未发现合作声明', statusEvidence = [];
  if (open.length && declined.length) {code='conflict'; label='公开表述冲突，需核对'; statusEvidence=[...declined,...open];}
  else if (declined.length) {code='declined';label='明确拒绝或暂停';statusEvidence=declined;}
  else if (open.length) {code='open';label='有明确商务合作声明';statusEvidence=open;}
  else if (clues.length) {code='clue';label='有联系线索，商务性质未明';statusEvidence=clues;}
  return {
    schemaVersion: 2, id: crypto.randomUUID(), createdAt:new Date().toISOString(), ruleVersion:RULE_VERSION,
    creator:capture.creator, sourceUrl:capture.pageUrl, capturedAt:capture.capturedAt, mode,
    assessment:{...LEVELS[level]}, evidence: evidence.sort((a,b)=>b.level-a.level),
    cooperation:{code,label,scope:mode === 'selection' ? '仅判断本段选文' : '仅判断主页简介中的表述',evidence:statusEvidence.slice(0,8)},
    channels:[...channels.values()], excluded:excluded.slice(0,20),
    sample:{blocks:unique.length,characters:unique.reduce((n,b)=>n+b.text.length,0),types:[...new Set(unique.map(b=>b.type))],linkedWorks:new Set(unique.map(b=>videoId(b.url)).filter(Boolean)).size,completeWorks:0},
    disclosureRate:{value:null,reason:'尚未完整采集视频简介及相关声明；标题和单段选文不能作为披露率的分母。'},
    limitation:'本项目自定义证据等级，取本次有效证据可支持的最高档，不加权、不累加。不是 B站官方评分，不代表商业化程度、收入、合作概率或投放价值。未观察到不等于不存在；历史披露不代表当前接受合作。'
  };
}
