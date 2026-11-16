export const RULE_VERSION = 'commercial-v1.0';
export const RULES = [
  { id: 'collaboration', name: '明确商务合作', weight: 35, description: '出现商务合作、品牌合作、商单或广告招募的明确表述。', patterns: ['商务(?:合作|联系|咨询|洽谈|推广)?', '合作请联系', '合作(?:邮箱|联系)', '商业合作', '品牌合作', '接(?:受)?商单', '广告合作', '广告投放', '推广合作'], negative: '(?:不|勿|拒绝|暂停|停止|谢绝|无|没有|暂不|不再|从不|不接受).{0,7}(?:商务|商单|广告|商业合作|品牌合作)|非商业|非广告' },
  { id: 'sales', name: '自有商品与付费服务', weight: 30, description: '明确提及店铺、购买入口、付费课程、咨询或带货。', patterns: ['淘宝店', '天猫店', '微店', '小店', '店铺', '购买链接', '下单', '付费(?:课程|咨询|服务|社群)', '课程购买', '带货', '橱窗'], negative: '(?:不|勿|拒绝|暂停|停止|谢绝|无|没有|不做|不卖).{0,6}(?:店铺|下单|付费|带货|课程|小店)|免费课程|谨防|诈骗|冒充' },
  { id: 'sponsor', name: '内容赞助声明', weight: 25, description: '作者公开声明某内容由品牌赞助、冠名或提供商业支持。', patterns: ['本(?:期|视频|次).{0,12}(?:赞助|冠名)', '由.{1,20}(?:赞助|冠名)', '感谢.{1,18}(?:赞助|冠名)', '赞助商', '商业赞助'], negative: '(?:无|没有|未|不接受|拒绝).{0,6}(?:赞助|冠名)|无广|非商业' },
  { id: 'membership', name: '付费支持入口', weight: 10, description: '作者在简介或所选文字中主动引导充电、付费会员或打赏。平台通用“充电”按钮不计分。', patterns: ['为我充电', '给我充电', '充电支持', '充电专属', '付费会员', '打赏支持', '支持我的创作', '赞赏支持'], negative: '(?:不|勿|无需|不用|拒绝|停止).{0,6}(?:充电|付费|打赏|赞赏)' }
];

export function analyze(capture, mode = 'page') {
  if (!capture.creator?.uid || !capture.creator?.name) throw new Error('缺少可验证的创作者身份。');
  const selected = capture.selection?.trim();
  if (mode === 'selection' && (!selected || selected.length < 8)) throw new Error('请先在 UP 主主页选中至少 8 个字的公开内容，再打开插件。');
  const blocks = mode === 'selection' ? [{text: selected, type: '用户确认的公开选文', url: capture.pageUrl}] : capture.blocks;
  if (!blocks?.length) throw new Error('未读取到简介或作品标题。请等待页面加载，或选择主页中的公开文字后用“选中文字”分析。');
  const unique = [...new Map(blocks.map(b => [b.text, b])).values()];
  const rules = RULES.map(rule => {
    const evidence = [];
    const excluded = [];
    for (const block of unique) {
      for (const sentence of block.text.split(/[。！？!？\n；;]/).map(s => s.trim()).filter(Boolean)) {
        const pattern = rule.patterns.find(p => new RegExp(p, 'i').test(sentence));
        if (!pattern) continue;
        const match = sentence.match(new RegExp(pattern, 'i'));
        const start = Math.max(0, match.index - 45);
        const item = { quote: sentence.slice(start, start + 180), type: block.type, url: block.url, matched: match[0] };
        // Conservative sentence-level negation: prefer missing evidence to a false accusation.
        if (new RegExp(rule.negative, 'i').test(sentence)) excluded.push(item);
        else if (!evidence.some(e => e.quote === item.quote)) evidence.push(item);
      }
    }
    return {id: rule.id, name: rule.name, weight: rule.weight, description: rule.description, points: evidence.length ? rule.weight : 0, evidence: evidence.slice(0, 5), excluded: excluded.slice(0, 3)};
  });
  const score = rules.reduce((n, r) => n + r.points, 0);
  return {
    id: globalThis.crypto.randomUUID(), createdAt: new Date().toISOString(), ruleVersion: RULE_VERSION,
    creator: capture.creator, sourceUrl: capture.pageUrl, capturedAt: capture.capturedAt, mode,
    sample: { blocks: unique.length, characters: unique.reduce((n,b) => n+b.text.length, 0), types: [...new Set(unique.map(b=>b.type))] },
    score, level: score === 0 ? '本次未观察到' : score < 35 ? '少量公开信号' : score < 65 ? '部分公开信号' : '多类公开信号',
    rules,
    limitation: '分数是本次可见样本的规则命中总分，不是收入、商业能力、真实合作意愿或接受合作的概率。未命中不代表未商业化；未展开、未加载、视频画面及私信均未分析。'
  };
}
