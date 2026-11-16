// Self-contained: Chrome serializes this function into the active tab.
export function extractCreator() {
  try {
  const url = new URL(location.href);
  if (url.hostname !== 'space.bilibili.com' || !/^\/\d+(?:\/|$)/.test(url.pathname)) {
    throw new Error('请先打开 B站 UP 主主页（space.bilibili.com/数字ID），再点击插件。');
  }
  const uid = url.pathname.match(/^\/(\d+)/)[1];
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const first = selectors => {
    for (const selector of selectors) {
      const el = [...document.querySelectorAll(selector)].find(visible);
      if (el && clean(el.innerText)) return el;
    }
  };
  const nameEl = first(['.nickname', '#h-name', '.upinfo .name', '.up-info__name', '.h-name']);
  const titleName = document.title.match(/^(.+?)的个人空间/);
  const name = clean(nameEl?.innerText || titleName?.[1]);
  if (!name || /bilibili|哔哩哔哩|访问|验证|出错|登录/i.test(name)) {
    throw new Error('尚未识别到 UP 主。请等待主页加载完成，或先处理网页上的登录 / 验证提示。');
  }
  const creator = { name, uid, url: `https://space.bilibili.com/${uid}`, platform: '哔哩哔哩' };
  const blocks = [];
  const add = (el, type, link) => {
    if (!visible(el)) return;
    const text = clean(el.innerText || el.getAttribute('title'));
    if (text.length < 2 || blocks.some(b => b.text === text && b.type === type && b.url === (link || creator.url))) return;
    blocks.push({ type, text: text.slice(0, 3000), url: link || creator.url });
  };
  // Only profile-owned regions. Never scan body text, recommendations or comments.
  ['.header-sign', '.h-sign', '#h-sign', '.upinfo-sign', '.upinfo__sign', '.upinfo .sign', '.up-info__sign', '.upinfo .desc', '.upinfo__desc', '.signature'].forEach(s => {
    document.querySelectorAll(s).forEach(el => add(el, '主页简介'));
  });
  ['.bili-video-card__info--tit', '.bili-video-card__title', '.small-item .title', '.video-card .title'].forEach(s => {
    [...document.querySelectorAll(s)].slice(0, 40).forEach(el => {
      const anchor = el.closest('a') || el.querySelector('a');
      const href = anchor?.href;
      if (href && /^https:\/\/www\.bilibili\.com\/video\//.test(href)) add(el, '主页作品标题', href.split('?')[0]);
    });
  });
  const selection = window.getSelection();
  const selected = clean(selection?.toString());
  const excludedSelector = '[class*="comment"], [class*="reply"], [class*="recommend"], textarea, input, [contenteditable="true"]';
  const elementFor = node => node?.nodeType === 1 ? node : node?.parentElement;
  const inComments = elementFor(selection?.anchorNode)?.closest(excludedSelector) || elementFor(selection?.focusNode)?.closest(excludedSelector) ||
    (selected && selection.rangeCount && [...document.querySelectorAll(excludedSelector)].some(el => selection.getRangeAt(0).intersectsNode(el)));
  let selectionSource = null;
  if (selected && !inComments && selection.rangeCount) {
    const range = selection.getRangeAt(0);
    const container = elementFor(range.commonAncestorContainer);
    const title = container?.closest('.bili-video-card__title, .bili-video-card__info--tit, .small-item .title, .video-card .title');
    const anchor = container?.closest('a') || title?.querySelector('a');
    if (anchor && /^https:\/\/www\.bilibili\.com\/video\//.test(anchor.href) && anchor.contains(selection.anchorNode) && anchor.contains(selection.focusNode)) selectionSource = {url: anchor.href.split('?')[0]};
  }
  return { creator, blocks: blocks.slice(0, 50), selectionSource, selection: inComments ? '' : selected.slice(0, 12000), capturedAt: new Date().toISOString(), pageUrl: location.href };
  } catch (error) {
    return { error: error.message || '读取页面失败' };
  }
}
