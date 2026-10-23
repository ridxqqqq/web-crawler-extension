/* XPath 解析器 · lxml 风格 — 页面内浮动工作台
 * 依赖 lib.js 先注入；由 background.js（Ctrl+Shift+X）或 popup 注入。
 * 再次注入即关闭面板（开关语义）。
 */
(() => {
  if (!window.__xph) return;
  const X = window.__xph;
  const store = chrome.storage.local;

  function closePanel() {
    const p = document.getElementById('xph-panel-root');
    if (p) p.remove();
    const st = document.getElementById('xph-panel-style');
    if (st) st.remove();
    try { X.clearHighlight(); } catch (e) { }
    try { X.pickStop(); } catch (e) { }
    window.__xphPanelOpen = false;
  }

  if (window.__xphPanelOpen) { closePanel(); return; }
  window.__xphPanelOpen = true;

  /* ---------- 样式 ---------- */
  const CSS = [
    '#xph-panel-root { position: fixed; z-index: 2147483647; top: 84px; right: 24px; width: 560px; max-width: 94vw; max-height: 78vh; display: flex; flex-direction: column; background: #0e1117; color: #dbe4f3; border: 1px solid #262d3d; border-radius: 14px; box-shadow: 0 18px 60px rgba(0,0,0,.5); font: 13px/1.6 -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }',
    '#xph-panel-root * { box-sizing: border-box; }',
    '#xph-panel-root .xp-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #131826; border-bottom: 1px solid #262d3d; border-radius: 14px 14px 0 0; cursor: move; user-select: none; }',
    '#xph-panel-root .xp-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #eaf0fb; }',
    '#xph-panel-root .xp-sub { color: #7d889e; font: 400 11px/1.4 inherit; border: 1px solid #2b344a; border-radius: 6px; padding: 1px 6px; }',
    '#xph-panel-root .xp-hbtns { display: flex; gap: 6px; }',
    '#xph-panel-root button { all: unset; box-sizing: border-box; cursor: pointer; font-size: 12px; line-height: 1.4; color: #c7d3ea; background: #1b2233; border: 1px solid #2b3550; border-radius: 8px; padding: 5px 10px; text-align: center; }',
    '#xph-panel-root button:hover { border-color: #8cf24a; color: #8cf24a; }',
    '#xph-panel-root button:disabled { opacity: .5; cursor: default; }',
    '#xph-panel-root .xp-row { display: flex; gap: 8px; padding: 10px 12px 4px; }',
    '#xph-panel-root #xp-input { flex: 1; min-width: 0; background: #0a0d13; border: 1px solid #2b3550; border-radius: 10px; color: #e6edf8; padding: 8px 10px; font: 12.5px ui-monospace, Consolas, monospace; outline: none; }',
    '#xph-panel-root #xp-input:focus { border-color: #8cf24a; box-shadow: 0 0 0 2px rgba(140,242,74,.15); }',
    '#xph-panel-root #xp-run { background: #182a17; border-color: #2f5a2b; color: #a5e87f; white-space: nowrap; }',
    '#xph-panel-root .xp-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; }',
    '#xph-panel-root .xp-chip { font-size: 11px; color: #9fb0cc; background: #141a29; border: 1px solid #26304a; border-radius: 999px; padding: 3px 10px; }',
    '#xph-panel-root .xp-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 2px 12px 8px; }',
    '#xph-panel-root .xp-tools button { font-size: 11px; padding: 3px 8px; }',
    '#xph-panel-root .xp-opt { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #8d9ab3; user-select: none; }',
    '#xph-panel-root #xp-max { width: 58px; background: #0a0d13; border: 1px solid #2b3550; color: #dbe4f3; border-radius: 6px; padding: 2px 4px; font-size: 11px; }',
    '#xph-panel-root #xp-history { background: #141a29; color: #9fb0cc; border: 1px solid #26304a; border-radius: 6px; font-size: 11px; max-width: 132px; padding: 2px; }',
    '#xph-panel-root .xp-flex { flex: 1; }',
    '#xph-panel-root .xp-meta { padding: 6px 12px; font: 11.5px/1.7 ui-monospace, Consolas, monospace; color: #7fb069; border-top: 1px solid #1b2130; white-space: pre-wrap; word-break: break-all; }',
    '#xph-panel-root .xp-meta.err { color: #ff7a7a; }',
    '#xph-panel-root .xp-results { flex: 1; min-height: 120px; overflow: auto; padding: 8px 12px 12px; border-top: 1px solid #1b2130; }',
    '#xph-panel-root .xp-code { margin-bottom: 10px; padding: 10px 12px; background: #0a0d13; border: 1px solid #1e2637; border-radius: 10px; color: #cfe3ff; font: 12.5px/1.7 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }',
    '#xph-panel-root .xp-note { margin: 4px 0 10px; color: #67758f; font: 11.5px/1.6 ui-monospace, Consolas, monospace; white-space: pre-wrap; }',
    '#xph-panel-root .xp-error { padding: 10px 12px; background: #1a0e12; border: 1px solid #4a2430; border-radius: 10px; color: #ff9c9c; font: 12.5px/1.7 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }',
    '#xph-panel-root .xp-card { margin-bottom: 8px; padding: 8px 10px; background: #0b0f16; border: 1px solid #1e2637; border-radius: 10px; }',
    '#xph-panel-root .xp-card:hover { border-color: #31405f; }',
    '#xph-panel-root .xp-card-head { color: #9dd66f; font: 12px/1.6 ui-monospace, Consolas, monospace; word-break: break-all; }',
    '#xph-panel-root .xp-card-head[title] { cursor: pointer; }',
    '#xph-panel-root .xp-body { margin: 6px 0 0; color: #b9c6dd; font: 11.5px/1.7 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }',
    '#xph-panel-root .xp-body.dim { color: #7484a0; }',
    '#xph-panel-root .xp-card details { margin-top: 6px; }',
    '#xph-panel-root .xp-card summary { cursor: pointer; font-size: 11px; color: #5f7091; outline: none; }',
    '#xph-panel-root .xp-pick { border-color: #2f5a2b; background: #0d140d; }',
    '#xph-panel-root .xp-btnrow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }',
    '#xph-panel-root .xp-textrow { padding: 4px 6px; border-bottom: 1px solid #141a26; color: #c3d0e8; font: 11.5px/1.6 ui-monospace, Consolas, monospace; word-break: break-all; cursor: pointer; }',
    '#xph-panel-root .xp-textrow:hover { background: #121a2a; color: #a5e87f; }',
    '#xph-panel-root .xp-foot { padding: 6px 12px; border-top: 1px solid #1b2130; color: #586582; font-size: 10.5px; }'
  ].join('\n');

  const style = document.createElement('style');
  style.id = 'xph-panel-style';
  style.textContent = CSS;
  document.documentElement.appendChild(style);

  /* ---------- 结构 ---------- */
  const root = document.createElement('div');
  root.id = 'xph-panel-root';
  root.innerHTML = [
    '<div class="xp-head" id="xp-head">',
    '  <div class="xp-title">网络爬虫 <span class="xp-sub" id="xp-stylebadge">lxml 风格</span></div>',
    '  <div class="xp-hbtns">',
    '    <button id="xp-pick" title="点击页面元素，自动生成 XPath 并提取">◉ 选取元素</button>',
    '    <button id="xp-close" title="关闭（Ctrl+Shift+X）">✕</button>',
    '  </div>',
    '</div>',
    '<div class="xp-row">',
    '  <input id="xp-input" spellcheck="false" placeholder="//a[@href] — XPath 1.0，与 lxml 的 tree.xpath() 同语法">',
    '  <button id="xp-run" title="运行（Enter）">▶ 运行</button>',
    '</div>',
    '<div class="xp-chips" id="xp-chips"></div>',
    '<div class="xp-tools">',
    '  <button id="xp-style" title="切换 lxml / BeautifulSoup（BS4）展示风格与代码生成">风格: lxml</button>',
    '  <label class="xp-opt" title="在页面上高亮命中的元素"><input type="checkbox" id="xp-hl"> 高亮</label>',
    '  <label class="xp-opt">条数 <input type="number" id="xp-max" min="1" max="2000" value="200"></label>',
    '  <select id="xp-history" title="历史 XPath"><option value="">🕘 历史</option></select>',
    '  <span class="xp-flex"></span>',
    '  <button id="xp-copy-xp" title="复制当前 XPath">复制 XPath</button>',
    '  <button id="xp-copy-res" title="复制 lxml 风格结果文本">复制结果</button>',
    '  <button id="xp-copy-py" title="生成可在 Python 中复现的 lxml 代码">生成 Python 代码</button>',
    '  <button id="xp-text" title="批量提取当前 XPath 命中元素的文本（text_content，空白归一化）">提取文本</button>',
    '  <button id="xp-dl" title="下载当前渲染后 DOM 为 page.html，供 lxml.html.fromstring 读取">下载 page.html</button>',
    '</div>',
    '<div class="xp-meta" id="xp-meta">就绪 — 输入 XPath、点预设或“选取元素”</div>',
    '<div class="xp-results" id="xp-results"></div>',
    '<div class="xp-foot">Enter 运行 · Ctrl+Shift+X 开关面板 · 结果可一键生成 lxml / BS4 / parsel 复现代码</div>'
  ].join('\n');
  document.documentElement.appendChild(root);

  const el = (id) => document.getElementById(id);
  const input = el('xp-input');
  const metaBox = el('xp-meta');
  const resultsBox = el('xp-results');

  const PRESETS = [
    ['标题', '//title/text()'],
    ['链接', '//a'],
    ['链接地址', '//a/@href'],
    ['图片', '//img'],
    ['图片地址', '//img/@src'],
    ['段落', '//p'],
    ['标题层级', '//h1 | //h2 | //h3'],
    ['Meta', '//meta[@name or @property]'],
    ['带 id 元素', '//*[@id]'],
    ['class 含 main', '//*[contains(concat(" ", normalize-space(@class), " "), " main ")]']
  ];

  let lastXPath = null;
  let lastResult = null;
  let historyArr = [];
  let textMode = false;
  let textRes = null;
  let pickInfo = null;
  let lastWasPick = false;
  let styleMode = 'lxml'; // 'lxml' | 'bs4'

  const cut = (s, n) => {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…(截断)' : s;
  };

  function setMeta(text, cls) {
    metaBox.textContent = text;
    metaBox.className = 'xp-meta' + (cls ? ' ' + cls : '');
  }

  function fmtScalar(v) { return X.fmtScalar(v); }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.documentElement.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { }
      ta.remove();
      return ok;
    }
  }

  function flash(btn, txt) {
    const old = btn.textContent;
    btn.textContent = txt || '已复制 ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 900);
  }

  /* ---------- 结果渲染（lxml / BS4 双风格控制台观感） ---------- */
  function isBs4() { return styleMode === 'bs4'; }
  function isParsel() { return styleMode === 'parsel'; }

  function updateStyleUi() {
    const label = { lxml: 'lxml 风格', bs4: 'BS4 风格', parsel: 'parsel 风格' };
    el('xp-style').textContent = '风格: ' + (styleMode === 'bs4' ? 'BS4' : styleMode);
    el('xp-stylebadge').textContent = label[styleMode] || styleMode;
  }

  function parselRepr(it) {
    const q = cut(lastXPath || '', 60);
    if (it.kind === 'element') return '<Selector query=' + X.py.str(q) + ' data=' + X.py.str(cut(it.outerHTML || '', 200)) + '>';
    if (it.kind === 'comment') return "<Selector query=" + X.py.str(q) + " data='<!--" + cut(it.value, 80) + "-->'";
    return '<Selector query=' + X.py.str(q) + ' data=' + X.py.str(cut(String(it.value == null ? '' : it.value), 120)) + '>';
  }

  function bs4Repr(it) {
    if (it.kind === 'element') return cut(it.outerHTML || ('<' + it.tag + '>'), 240);
    if (it.kind === 'comment') return '<!--' + cut(it.value, 100) + '-->';
    return X.py.str(it.value == null ? '' : it.value);
  }

  function itemLines(it) {
    if (isParsel() && it.kind === 'element') {
      return [
        '.attrib   ' + X.py.dict(it.attrib),
        '.get()    ' + X.py.str(cut(it.outerHTML || '', 200)),
        ".xpath('string(.)').get()   " + X.py.str(cut(it.textContent, 160))
      ];
    }
    if (isBs4() && it.kind === 'element') {
      return [
        '.name        ' + X.py.str(it.tag),
        '.attrs       ' + X.py.dict(X.bs4Attrs(it.attrib)),
        '.get_text()  ' + X.py.str(cut(it.textContent, 200))
      ];
    }
    return [
      '.tag            ' + X.py.str(it.tag),
      '.text           ' + (it.text == null ? 'None' : X.py.str(cut(it.text, 160))),
      '.tail           ' + (it.tail == null ? 'None' : X.py.str(cut(it.tail, 80))),
      '.attrib         ' + X.py.dict(it.attrib)
    ];
  }

  function selCss(xpath) {
    const conv = X.xpathToCss(xpath);
    return X.py.str(conv.ok ? conv.css : '在此填写CSS选择器');
  }

  function bs4CodeLine(xpath) {
    const conv = X.xpathToCss(xpath);
    if (!conv.ok) {
      return '# BeautifulSoup 不支持 XPath，且该表达式无法自动转换为 CSS（' + conv.reason + '）\n' +
        '# 请手写等价选择器；下方结果仍按 BS4 风格展示\n' +
        '>>> results = soup.select(' + X.py.str('在此填写CSS选择器') + ')';
    }
    let line = '# XPath: ' + xpath + '  →  CSS: ' + conv.css + (conv.approx ? '（contains(@class) 为近似转换）' : '') + '\n' +
      '>>> results = soup.select(' + X.py.str(conv.css) + ')';
    if (conv.tail && conv.tail.type === 'attr') {
      line += '\n# 取属性: [el.get(' + X.py.str(conv.tail.name) + ') for el in results]';
    }
    return line;
  }

  function makeCard(it, i) {
    const card = document.createElement('div');
    card.className = 'xp-card';
    const head = document.createElement('div');
    head.className = 'xp-card-head';
    card.appendChild(head);

    if (it.kind === 'element' || it.kind === 'comment') {
      head.textContent = '[' + i + '] ' + (isBs4() ? bs4Repr(it) : (isParsel() ? parselRepr(it) : it.repr));
      const pre = document.createElement('pre');
      pre.className = 'xp-body';
      pre.textContent = itemLines(it).join('\n');
      card.appendChild(pre);
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = isBs4() ? 'outerHTML · get_text() 全文'
        : (isParsel() ? 'outerHTML · string(.) 全文' : '.text_content() · outerHTML');
      const dpre = document.createElement('pre');
      dpre.className = 'xp-body dim';
      dpre.textContent = (isBs4() ? '.get_text()  ' : (isParsel() ? ".xpath('string(.)').get()  " : '.text_content()  ')) +
        X.py.str(cut(it.textContent, 400)) + '\n\n' + (it.outerHTML || '');
      det.appendChild(sum);
      det.appendChild(dpre);
      card.appendChild(det);
      if (it.kind === 'element' && lastXPath) {
        head.title = '点击在页面中定位该元素';
        head.addEventListener('click', () => X.scrollToItem(lastXPath, i));
      }
    } else if (it.kind === 'attr' || it.kind === 'text') {
      head.textContent = '[' + i + '] ' + X.py.str(cut(it.value, 200));
      const pre = document.createElement('pre');
      pre.className = 'xp-body dim';
      pre.textContent = isParsel()
        ? '# getall() 一次取全部字符串；get() 取第一条（无则 None）'
        : isBs4()
          ? (it.kind === 'attr'
            ? '# BS4 中取属性: el.get(' + X.py.str(it.name) + ')；注意 class 在 attrs 里是列表'
            : '# BS4 中取文本: el.get_text()；text() 节点对应 NavigableString')
          : (it.kind === 'attr'
            ? '# smart string：print 时是 str，仍可用 .getparent() 回溯节点'
            : '# text() 返回文本节点（smart string），不是元素的 .text 属性');
      card.appendChild(pre);
    } else if (it.kind === 'document') {
      head.textContent = '[' + i + '] ' + it.repr;
    } else {
      head.textContent = '[' + i + '] ' + String(it.value == null ? '' : it.value);
    }
    return card;
  }

  function renderResult(res) {
    resultsBox.textContent = '';
    if (!res.ok) {
      setMeta('XPath 错误', 'err');
      const d = document.createElement('div');
      d.className = 'xp-error';
      d.textContent = 'XPathEvalError: ' + res.error +
        '\n\n# 提示：浏览器与 lxml 同为 XPath 1.0；字符串要用引号；函数区分大小写；HTML 标签为小写。';
      resultsBox.appendChild(d);
      return;
    }
    if (res.scalar) {
      setMeta('# 标量结果 · ' + res.scalar + ' · ' + res.ms + ' ms');
      const c = document.createElement('div');
      c.className = 'xp-code';
      c.textContent = '>>> tree.xpath(' + X.py.str(res.xpath) + ')\n' + fmtScalar(res.value);
      resultsBox.appendChild(c);
      const n = document.createElement('div');
      n.className = 'xp-note';
      n.textContent = res.scalar === 'float'
        ? '# XPath 1.0 中 count()/number() 返回 float，与 lxml 一致'
        : res.scalar === 'str'
          ? '# 等价于 lxml 返回 Python str'
          : '# 等价于 lxml 返回 Python bool';
      resultsBox.appendChild(n);
      return;
    }
    const c = document.createElement('div');
    c.className = 'xp-code';
    const codeLine = isBs4() ? bs4CodeLine(res.xpath)
      : (isParsel() ? '>>> sel.xpath(' + X.py.str(res.xpath) + ')' : '>>> results = tree.xpath(' + X.py.str(res.xpath) + ')');
    const reprs = res.items.slice(0, 5).map(it => isBs4() ? bs4Repr(it) : (isParsel() ? parselRepr(it) : (it.repr || X.py.str(it.value == null ? '' : it.value))));
    c.textContent = codeLine + '\n' +
      (res.total === 0 ? '[]' : '[' + reprs.join(', ') + (res.items.length > 5 ? ', …' : '') + ']');
    resultsBox.appendChild(c);

    let mt = '# len(results) = ' + res.total + ' · ' + (isBs4() ? 'list[Tag]' : (isParsel() ? 'SelectorList' : res.pytype)) + ' · ' + res.ms + ' ms';
    if (res.truncated) mt += '\n# 仅展示前 ' + res.shown + ' 条（调整上方“条数”）';
    setMeta(mt);

    if (lastWasPick && pickInfo && pickInfo.xpath === res.xpath) resultsBox.appendChild(makePickCard());
    res.items.forEach((it, i) => resultsBox.appendChild(makeCard(it, i)));

    if (res.total === 0) {
      const n = document.createElement('div');
      n.className = 'xp-note';
      n.textContent = '# 空列表 — 排查：标签大小写（HTML 为小写）/ 属性名 / 相对路径 .// 前缀 / XHTML 命名空间（用 local-name()）';
      resultsBox.appendChild(n);
    }
  }

  function buildResultText(res) {
    if (!res || !res.ok) return '';
    const lines = [];
    if (res.scalar) {
      lines.push('>>> tree.xpath(' + X.py.str(res.xpath) + ')', fmtScalar(res.value));
      return lines.join('\n');
    }
    lines.push(isBs4() ? bs4CodeLine(res.xpath)
      : (isParsel() ? '>>> sel.xpath(' + X.py.str(res.xpath) + ')' : '>>> results = tree.xpath(' + X.py.str(res.xpath) + ')'));
    lines.push('[' + res.items.map(it => isBs4() ? bs4Repr(it) : (isParsel() ? parselRepr(it) : (it.repr || X.py.str(it.value == null ? '' : it.value)))).join(', ') +
      (res.truncated ? ', …' : '') + ']');
    lines.push('# len(results) = ' + res.total + ' · ' + (isBs4() ? 'list[Tag]' : (isParsel() ? 'SelectorList' : res.pytype)));
    res.items.forEach((it, i) => {
      if (it.kind === 'element' || it.kind === 'comment') {
        lines.push('# [' + i + '] ' + (isBs4() ? bs4Repr(it) : (isParsel() ? parselRepr(it) : ('.tag=' + X.py.str(it.tag) + ' .text=' +
          (it.text == null ? 'None' : X.py.str(cut(it.text, 80)))))));
        lines.push('#      ' + itemLines(it).join('\n#      '));
      } else if (it.kind === 'attr' || it.kind === 'text') {
        lines.push('# [' + i + '] ' + X.py.str(cut(it.value, 160)));
      }
    });
    return lines.join('\n');
  }

  /* ---------- 选取元素的文本卡片 与 文本提取视图 ---------- */
  function makePickCard() {
    const card = document.createElement('div');
    card.className = 'xp-card xp-pick';
    const head = document.createElement('div');
    head.className = 'xp-card-head';
    head.textContent = '◉ 选取元素 · ' + pickInfo.xpath;
    card.appendChild(head);
    const pre = document.createElement('pre');
    pre.className = 'xp-body';
    pre.textContent = (isBs4() ? '.get_text()  ' : (isParsel() ? ".xpath('string(.)').get()  " : '.text_content()  ')) +
      (pickInfo.text ? X.py.str(cut(pickInfo.text, 300)) : "'（该元素无文本）'");
    card.appendChild(pre);
    const row = document.createElement('div');
    row.className = 'xp-btnrow';
    const mk = (label, fn, title) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    row.appendChild(mk('复制文本', async () => {
      const ok = await copyText(pickInfo.text || '');
      if (ok) setMeta('# 选取元素的文本已复制');
    }));
    row.appendChild(mk('直接文本 /text()', () => {
      const xp = pickInfo.xpath + '/text()';
      input.value = xp;
      runXPath(xp, true);
    }, '只取该元素的直接文本节点（lxml 同样支持）'));
    row.appendChild(mk('全部文本 //text()', () => {
      const xp = pickInfo.xpath + '//text()';
      input.value = xp;
      runXPath(xp, true);
    }, '取该元素及全部后代的文本节点'));
    row.appendChild(mk('批量提取 →', showTextView, '提取当前 XPath 命中元素的文本'));
    card.appendChild(row);
    return card;
  }

  function showTextView() {
    if (!lastXPath) { setMeta('# 先运行一个 XPath，再提取文本'); return; }
    const max = Math.max(1, Math.min(parseInt(el('xp-max').value, 10) || 200, 2000));
    textRes = X.texts(lastXPath, { max: max });
    textMode = true;
    renderTextView(textRes);
  }

  function renderTextView(tres) {
    resultsBox.textContent = '';
    if (!tres.ok) {
      setMeta('XPath 错误', 'err');
      const d = document.createElement('div');
      d.className = 'xp-error';
      d.textContent = 'XPathEvalError: ' + tres.error;
      resultsBox.appendChild(d);
      return;
    }
    const c = document.createElement('div');
    c.className = 'xp-code';
    const preview = tres.items.slice(0, 4).map(it => X.py.str(cut(it.text, 60)));
    c.textContent = (isBs4()
      ? ">>> texts = [re.sub(r'\\s+', ' ', el.get_text()).strip()\n...          for el in soup.select(" + selCss(tres.xpath) + ')]'
      : (isParsel()
        ? ">>> texts = [re.sub(r'\\s+', ' ', el.xpath('string(.)').get() or '').strip()\n...          for el in sel.xpath(" + X.py.str(tres.xpath) + ')]'
        : ">>> texts = [re.sub(r'\\s+', ' ', el.text_content()).strip()\n...          for el in tree.xpath(" + X.py.str(tres.xpath) + ')]')) + '\n' +
      (tres.items.length === 0 ? '[]' : '[' + preview.join(', ') + (tres.items.length > 4 ? ', …' : '') + ']');
    resultsBox.appendChild(c);
    let mt = '# 文本提取 · len = ' + tres.total + ' · 空白已归一化（lxml: text_content() / BS4: get_text() / parsel: string(.)）';
    if (tres.nonText) mt += ' · 跳过 ' + tres.nonText + ' 个非文本节点';
    if (tres.truncated) mt += '\n# 仅展示前 ' + tres.shown + ' 条（调整上方“条数”）';
    setMeta(mt);
    if (tres.items.length === 0) {
      const n = document.createElement('div');
      n.className = 'xp-note';
      n.textContent = tres.total === 0
        ? '# 当前 XPath 没有命中任何节点'
        : '# 命中的节点里没有文本（例如都是属性值）——试试“复制结果”或改用 //x/text()';
      resultsBox.appendChild(n);
    }
    tres.items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'xp-textrow';
      row.textContent = '[' + it.index + '] ' + (it.text || '(空)') + (it.trunc ? '…' : '');
      if (lastXPath) {
        row.title = '点击在页面中定位该节点';
        row.addEventListener('click', () => X.scrollToItem(lastXPath, it.index));
      }
      resultsBox.appendChild(row);
    });
    const row2 = document.createElement('div');
    row2.className = 'xp-btnrow';
    const mk2 = (label, fn, title) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (title) b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    row2.appendChild(mk2('复制全部文本', async () => {
      const ok = await copyText(textRes.items.map(it => it.text).join('\n'));
      if (ok) setMeta('# 已复制全部文本（' + textRes.items.length + ' 条）');
    }));
    row2.appendChild(mk2('生成 Python 代码', async () => {
      const ok = await copyText(X.pythonSnippet(lastXPath, { textMode: true, style: styleMode }));
      if (ok) setMeta('# 文本提取版 Python 代码已复制（' + (isBs4() ? 'BS4' : 'lxml') + '）');
    }, '含 re.sub 空白归一化，与面板显示完全一致'));
    row2.appendChild(mk2('← 返回元素视图', () => {
      if (lastXPath) runXPath(lastXPath, false);
    }));
    resultsBox.appendChild(row2);
  }

  /* ---------- 运行 ---------- */
  async function runXPath(xp, fromUser, isPick) {
    lastXPath = xp;
    textMode = false;
    lastWasPick = !!isPick;
    const max = Math.max(1, Math.min(parseInt(el('xp-max').value, 10) || 200, 2000));
    const res = X.extract(xp, { max: max });
    lastResult = res;
    try { X.clearHighlight(); } catch (e) { }
    renderResult(res);
    if (res.ok && el('xp-hl').checked && res.items && res.items.some(it => it.kind === 'element')) {
      try { X.highlight(xp); } catch (e) { }
    }
    if (res.ok && fromUser) pushHistory(xp);
  }

  /* ---------- 历史 ---------- */
  function renderHistory() {
    const sel = el('xp-history');
    sel.textContent = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = '🕘 历史 (' + historyArr.length + ')';
    sel.appendChild(first);
    historyArr.forEach((xp) => {
      const o = document.createElement('option');
      o.value = xp;
      o.textContent = xp.length > 34 ? xp.slice(0, 34) + '…' : xp;
      sel.appendChild(o);
    });
  }

  function pushHistory(xp) {
    historyArr = [xp].concat(historyArr.filter(x => x !== xp)).slice(0, 20);
    store.set({ history: historyArr });
    renderHistory();
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    PRESETS.forEach(([label, xp]) => {
      const b = document.createElement('button');
      b.className = 'xp-chip';
      b.textContent = label;
      b.title = xp;
      b.addEventListener('click', () => { input.value = xp; runXPath(xp, true); });
      el('xp-chips').appendChild(b);
    });

    el('xp-run').addEventListener('click', () => {
      const xp = input.value.trim();
      if (xp) runXPath(xp, true);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const xp = input.value.trim();
        if (xp) runXPath(xp, true);
      }
    });

    el('xp-hl').addEventListener('change', () => {
      store.set({ hl: el('xp-hl').checked });
      if (!el('xp-hl').checked) { try { X.clearHighlight(); } catch (e) { } }
      else if (lastResult && lastResult.ok && lastXPath) { try { X.highlight(lastXPath); } catch (e) { } }
    });

    el('xp-max').addEventListener('change', () => {
      const v = Math.max(1, Math.min(parseInt(el('xp-max').value, 10) || 200, 2000));
      el('xp-max').value = v;
      store.set({ max: v });
    });

    el('xp-history').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v) { input.value = v; runXPath(v, true); }
    });

    el('xp-copy-xp').addEventListener('click', async () => {
      const ok = await copyText(lastXPath || input.value.trim());
      if (ok) flash(el('xp-copy-xp'));
    });

    el('xp-copy-res').addEventListener('click', async () => {
      const text = buildResultText(lastResult);
      if (!text) { setMeta('# 还没有可复制的结果'); return; }
      const ok = await copyText(text);
      if (ok) flash(el('xp-copy-res'));
    });

    el('xp-copy-py').addEventListener('click', async () => {
      const ok = await copyText(X.pythonSnippet(lastXPath || input.value.trim() || '//a', { textMode: textMode, style: styleMode }));
      if (ok) flash(el('xp-copy-py'));
    });

    el('xp-text').addEventListener('click', showTextView);

    el('xp-style').addEventListener('click', () => {
      const order = ['lxml', 'bs4', 'parsel'];
      styleMode = order[(order.indexOf(styleMode) + 1) % order.length];
      store.set({ style: styleMode });
      updateStyleUi();
      if (textMode && lastXPath) showTextView();
      else if (lastResult) renderResult(lastResult);
    });

    el('xp-dl').addEventListener('click', () => {
      const doctype = document.doctype ? '<!DOCTYPE html>\n' : '';
      const html = doctype + document.documentElement.outerHTML;
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      const name = ((location.hostname || 'page').replace(/[^\w.-]+/g, '_') || 'page') + '.html';
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = name;
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      setMeta('# 已下载 ' + name + ' — 配合“生成 Python 代码”在本地 lxml 中复现');
    });

    el('xp-pick').addEventListener('click', () => {
      root.style.visibility = 'hidden';
      X.pickStart();
    });

    el('xp-close').addEventListener('click', closePanel);

    input.addEventListener('focus', () => { input.select(); });

    // 选取结果
    window.addEventListener('__xph-picked', (e) => {
      if (!document.getElementById('xph-panel-root')) return;
      root.style.visibility = '';
      const d = (e && e.detail) || {};
      if (d.xpath) {
        input.value = d.xpath;
        const t = X.texts(d.xpath, { max: 1 });
        pickInfo = { xpath: d.xpath, text: (t.ok && t.items && t.items[0]) ? t.items[0].text : '' };
        runXPath(d.xpath, true, true);
      }
    });

    // 拖动
    el('xp-head').addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input, select')) return;
      const r = root.getBoundingClientRect();
      window.__xphDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    });
  }

  if (!window.__xphDragBound) {
    window.__xphDragBound = true;
    window.addEventListener('mousemove', (e) => {
      const d = window.__xphDrag;
      if (!d) return;
      const p = document.getElementById('xph-panel-root');
      if (!p) { window.__xphDrag = null; return; }
      const l = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - 100);
      const t = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 40);
      p.style.left = l + 'px';
      p.style.top = t + 'px';
      p.style.right = 'auto';
    });
    window.addEventListener('mouseup', () => {
      const d = window.__xphDrag;
      if (!d) return;
      window.__xphDrag = null;
      const p = document.getElementById('xph-panel-root');
      if (!p) return;
      const r = p.getBoundingClientRect();
      try { store.set({ pos: { l: Math.round(r.left), t: Math.round(r.top) } }); } catch (e) { }
    });
  }

  /* ---------- 初始化 ---------- */
  bind();

  (async function init() {
    try {
      const cfg = await store.get({ hl: true, max: 200, history: [], pos: null, style: 'lxml' });
      el('xp-hl').checked = cfg.hl !== false;
      el('xp-max').value = cfg.max || 200;
      styleMode = ['lxml', 'bs4', 'parsel'].indexOf(cfg.style) !== -1 ? cfg.style : 'lxml';
      updateStyleUi();
      historyArr = Array.isArray(cfg.history) ? cfg.history : [];
      renderHistory();
      if (cfg.pos && typeof cfg.pos.l === 'number' && typeof cfg.pos.t === 'number') {
        root.style.left = cfg.pos.l + 'px';
        root.style.top = cfg.pos.t + 'px';
        root.style.right = 'auto';
      }
    } catch (e) { }
    input.value = '//a';
    runXPath('//a', false);
  })();
})();
