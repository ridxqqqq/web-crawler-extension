/* XPath 解析器 · lxml 风格 — 工具栏弹窗
 * 提供页面信息、快捷提取预设（lxml 风格预览）、复制结果 / Python 代码、打开浮动面板。
 */
const $ = (s) => document.querySelector(s);
let tab = null;
let lastRes = null;
let lastXp = null;

const PRESETS = [
  ['标题', '//title/text()'],
  ['链接', '//a'],
  ['链接地址', '//a/@href'],
  ['图片', '//img'],
  ['图片地址', '//img/@src'],
  ['段落', '//p']
];

/* 可注入的地址协议；其余（chrome://、chrome-extension://、edge://、about: 等）为受限页。
 * URL 未知时不拦截——交给实际注入尝试，再按错误类型给出提示。 */
const ALLOWED_URL = /^(https?|file|ftp):/i;

function urlHint(url) {
  if (url && !ALLOWED_URL.test(url)) {
    return '这是浏览器内部页面或其他扩展的页面，浏览器禁止扩展向其注入脚本。请切换到普通网页（https://…）后使用。';
  }
  return null;
}

function friendlyInjectError(err) {
  const m = (err && err.message) ? err.message : String(err);
  if (/chrome-extension:\/\/ URL/i.test(m)) {
    return '注入被浏览器拒绝：当前标签页属于其他扩展。\n' +
      '最常见于：内置 PDF 查看器打开的 PDF、或某个扩展自己打开的页面（地址为 chrome-extension://…）。\n' +
      '浏览器安全机制禁止扩展互相注入，请切换到普通网页（https://…）后重试。';
  }
  if (/chrome:\/\//i.test(m)) {
    return '注入被浏览器拒绝：chrome:// 等浏览器内部页面无法注入。\n请切换到普通网页（https://…）后重试。';
  }
  if (/edge:\/\//i.test(m)) {
    return '注入被浏览器拒绝：Edge 浏览器内部页面无法注入。\n请切换到普通网页（https://…）后重试。';
  }
  if (/access contents of the page|host permission/i.test(m)) {
    return '注入被浏览器拒绝：缺少该站点的主机权限。\n' +
      '普通网页请直接重试；若要在本地 HTML 文件中使用，请到"管理扩展 → 本扩展 → 详情"开启"允许访问文件网址"。';
  }
  return '注入失败：' + m;
}

/* ---------- Python 字面量（与 lib.js 保持一致） ---------- */
function pyStr(s) {
  if (s === null || s === undefined) return 'None';
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '\\') out += '\\\\';
    else if (ch === "'") out += "\\'";
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += '\\x' + c.toString(16).padStart(2, '0');
    else out += ch;
  }
  return "'" + out + "'";
}
function pyDict(o) {
  return '{' + Object.keys(o).map(k => pyStr(k) + ': ' + pyStr(o[k])).join(', ') + '}';
}
function fmtScalar(v) {
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  return pyStr(v);
}

/* ---------- 工具 ---------- */
function setStatus(t) { $('#status').textContent = t || ''; }
function showErr(t) { const e = $('#err'); e.textContent = t; e.classList.remove('hidden'); }
function hideErr() { $('#err').classList.add('hidden'); }

async function ensureLib() {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib.js'] });
}

async function callTab(func, args) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: func,
    args: args || []
  });
  return r && r.result;
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { }
    ta.remove();
    return ok;
  }
}

function flash(btn, txt) {
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = txt || '已复制 ✓';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 900);
}

/* ---------- 结果渲染 ---------- */
function renderOut(res) {
  const out = $('#out');
  out.classList.remove('hidden');
  out.textContent = '';
  const head = document.createElement('div');
  head.className = 'h';
  out.appendChild(head);
  if (!res.ok) {
    head.textContent = 'XPathEvalError: ' + res.error;
    setStatus('表达式错误，详见浮动面板');
    return;
  }
  if (res.scalar) {
    head.textContent = '>>> tree.xpath(' + pyStr(res.xpath) + ')\n' + fmtScalar(res.value);
    setStatus('标量结果（' + res.scalar + '）');
    return;
  }
  head.textContent = '>>> results = tree.xpath(' + pyStr(res.xpath) + ')';
  const reprs = res.items.slice(0, 8).map(it => it.repr || fmtScalar(it.value == null ? '' : it.value));
  const list = document.createElement('div');
  list.textContent = res.total === 0
    ? '[]'
    : '[' + reprs.join(', ') + (res.items.length > 8 ? ', …' : '') + ']';
  out.appendChild(list);
  res.items.slice(0, 8).forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'd';
    if (it.kind === 'element') {
      const t = it.text ? it.text.trim().slice(0, 36) : '';
      const link = it.attrib.href || it.attrib.src || '';
      d.textContent = '# [' + i + '] .tag=' + it.tag +
        (t ? ' .text=' + pyStr(t) : '') +
        (link ? ' href=' + pyStr(link.slice(0, 72)) : '') +
        '\n#      .attrib=' + pyDict(it.attrib);
    } else {
      d.textContent = '# [' + i + '] ' + pyStr(String(it.value == null ? '' : it.value).slice(0, 90));
    }
    out.appendChild(d);
  });
  setStatus('len(results) = ' + res.total +
    (res.truncated ? '（仅预览前 8 条，完整结果见浮动面板）' : ' · ' + res.ms + ' ms'));
}

function buildResultText(res) {
  if (!res || !res.ok) return '';
  const lines = ['>>> results = tree.xpath(' + pyStr(res.xpath) + ')'];
  if (res.scalar) {
    lines.push(fmtScalar(res.value));
    return lines.join('\n');
  }
  const reprs = res.items.map(it => it.repr || fmtScalar(it.value == null ? '' : it.value));
  lines.push('[' + reprs.join(', ') + (res.truncated ? ', …' : '') + ']');
  lines.push('# len(results) = ' + res.total + ' · ' + res.pytype);
  res.items.forEach((it, i) => {
    if (it.kind === 'element') {
      lines.push('# [' + i + '] .tag=' + pyStr(it.tag) + ' .text=' +
        (it.text == null ? 'None' : pyStr(String(it.text).slice(0, 80))));
      lines.push('#      .attrib=' + pyDict(it.attrib));
    } else if (it.kind === 'attr' || it.kind === 'text') {
      lines.push('# [' + i + '] ' + pyStr(String(it.value == null ? '' : it.value).slice(0, 120)));
    }
  });
  return lines.join('\n');
}

/* ---------- 动作 ---------- */
async function runPreset(xp) {
  hideErr();
  if (!tab) { showErr('无法获取当前标签页。'); return; }
  const hint = urlHint(tab.url);
  if (hint) { showErr(hint); return; }
  setStatus('运行中…');
  try {
    await ensureLib();
    const res = await callTab((x, o) => window.__xph.extract(x, o), [xp, { max: 200 }]);
    lastRes = res;
    lastXp = xp;
    renderOut(res);
  } catch (e) {
    showErr(friendlyInjectError(e));
  }
}

/* ---------- 初始化 ---------- */
async function init() {
  const chips = $('#chips');
  PRESETS.forEach(([label, xp]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = xp;
    b.addEventListener('click', () => runPreset(xp));
    chips.appendChild(b);
  });

  try { tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]; } catch (e) { tab = null; }
  if (!tab) { showErr('无法获取当前标签页。'); return; }
  $('#p-title').textContent = tab.title || '（未知标题）';

  // 已知受限地址（chrome://、其他扩展页等）：直接给结论
  const knownHint = urlHint(tab.url);
  if (knownHint) {
    $('#p-url').textContent = tab.url;
    showErr(knownHint);
    return;
  }

  // 自检：打开弹窗即尝试与页面通信，读取页面真实地址（地址栏可能被 Chrome 隐藏）
  try {
    await ensureLib();
    const info = await callTab(() => ({ href: location.href, title: document.title }), []);
    const href = (info && info.href) || '';
    $('#p-url').textContent = href || '（未读到页面地址）';
    if (info && info.title && !tab.title) $('#p-title').textContent = info.title;
    setStatus('当前页面可注入 ✓ — 点上方预设提取，或 Ctrl+Shift+X 打开浮动面板');
  } catch (e) {
    $('#p-url').textContent = '（Chrome 隐藏了该页地址 —— 见下方说明）';
    showErr(friendlyInjectError(e));
  }

  $('#open-panel').addEventListener('click', async () => {
    hideErr();
    if (!tab) { showErr('无法获取当前标签页。'); return; }
    const h = urlHint(tab.url);
    if (h) { showErr(h); return; }
    try {
      await ensureLib();
      const open = await callTab(() => !!window.__xphPanelOpen, []);
      if (open) { setStatus('浮动面板已在页面中打开（Ctrl+Shift+X 可关闭）。'); return; }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['panel.js'] });
      setStatus('浮动面板已注入当前页面。');
      window.close();
    } catch (e) {
      showErr(friendlyInjectError(e));
    }
  });

  $('#copy-res').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!lastRes) { setStatus('先运行一个预设，或使用浮动面板。'); return; }
    const ok = await copyText(buildResultText(lastRes));
    if (ok) flash(btn);
  });

  $('#copy-py').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const xp = lastXp || '//a';
    if (!tab) { showErr('无法获取当前标签页。'); return; }
    const h = urlHint(tab.url);
    if (h) { showErr(h); return; }
    try {
      await ensureLib();
      const code = await callTab((x) => window.__xph.pythonSnippet(x), [xp]);
      const ok = await copyText(code);
      if (ok) flash(btn);
    } catch (err) {
      showErr(friendlyInjectError(err));
    }
  });
}

init();
