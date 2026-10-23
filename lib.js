/* XPath 解析器 · lxml 风格 — 共享解析库（注入页面 isolated world）
 * 暴露 window.__xph API：
 *   extract(xpath, opts)          执行 XPath 并按 lxml 习惯序列化结果
 *   pythonSnippet(xpath)          生成可在 Python(lxml) 中复现的代码
 *   pickStart() / pickStop()      点击选取元素，自动生成 XPath
 *   highlight(xpath) / clearHighlight() / scrollToItem(xpath, i)
 *   py.str / py.dict / fmtScalar  Python 字面量格式化
 */
(() => {
  if (window.__xph) return; // 已注入

  /* ---------- Python 字面量格式化 ---------- */
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

  function pyDict(obj) {
    const parts = Object.keys(obj).map(k => pyStr(k) + ': ' + pyStr(obj[k]));
    return '{' + parts.join(', ') + '}';
  }

  // 伪内存地址，仅用于还原 lxml 的 <Element tag at 0x...> 观感，稳定可复现
  function fakeAddr(i) {
    return '0x' + (0x7f2a1c000000 + i * 0x38).toString(16);
  }

  function fmtScalar(v) {
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') return String(v);
    return pyStr(v);
  }

  /* ---------- 节点序列化（对齐 lxml 习惯） ---------- */
  function serialize(node, i) {
    switch (node.nodeType) {
      case 1: { // 元素：lxml html 解析器将标签统一为小写
        const tag = node.tagName.toLowerCase();
        const attrib = {};
        for (const a of node.attributes) attrib[a.name] = a.value;
        const text = (node.firstChild && node.firstChild.nodeType === 3) ? node.firstChild.nodeValue : null;
        const tail = (node.nextSibling && node.nextSibling.nodeType === 3) ? node.nextSibling.nodeValue : null;
        const outer = node.outerHTML || '';
        return {
          kind: 'element', tag, attrib, text, tail,
          textContent: node.textContent,
          outerHTML: outer.length > 400 ? outer.slice(0, 400) + '…(截断)' : outer,
          repr: '<Element ' + tag + ' at ' + fakeAddr(i) + '>'
        };
      }
      case 2: // 属性节点：lxml 中 //a/@href 返回 smart string
        return { kind: 'attr', name: node.name, value: node.value };
      case 3: // 文本节点
        return { kind: 'text', value: node.nodeValue };
      case 8: // 注释
        return { kind: 'comment', value: node.nodeValue, repr: '<Element comment at ' + fakeAddr(i) + '>' };
      case 9: // 文档根
        return { kind: 'document', repr: '<Document at ' + fakeAddr(i) + '>' };
      default:
        return { kind: 'other', value: String(node.nodeValue == null ? '' : node.nodeValue) };
    }
  }

  // 表达式是否以属性或 text() 结尾（lxml 对应返回 smart string 列表）
  function detectStringExpr(xp) {
    const x = String(xp).trim();
    return /(?:^|\/)@(?:[A-Za-z_][\w.:-]*|\*)\s*$/.test(x) || /text\(\)\s*$/.test(x);
  }

  /* ---------- 核心提取 ---------- */
  function extract(xpath, opts) {
    opts = opts || {};
    const t0 = performance.now();
    const max = Math.max(1, Math.min(opts.max || 200, 2000));
    function elapsed() { return +(performance.now() - t0).toFixed(1); }
    let r;
    try {
      r = document.evaluate(xpath, document, null, XPathResult.ANY_TYPE, null);
    } catch (e) {
      return { ok: false, xpath: xpath, error: (e && e.message) ? e.message : String(e) };
    }
    try {
      // 标量表达式：lxml 返回 str / float / bool
      if (r.resultType === XPathResult.STRING_TYPE)
        return { ok: true, xpath: xpath, scalar: 'str', value: r.stringValue, ms: elapsed() };
      if (r.resultType === XPathResult.NUMBER_TYPE)
        return { ok: true, xpath: xpath, scalar: 'float', value: r.numberValue, ms: elapsed() };
      if (r.resultType === XPathResult.BOOLEAN_TYPE)
        return { ok: true, xpath: xpath, scalar: 'bool', value: r.booleanValue, ms: elapsed() };

      // 节点集合：lxml 返回 list
      r = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const total = r.snapshotLength;
      const n = Math.min(total, max);
      const items = [];
      for (let i = 0; i < n; i++) items.push(serialize(r.snapshotItem(i), i));
      const kinds = new Set(items.map(x => x.kind));
      let pytype = 'list';
      if (total === 0) pytype = 'list';
      else if (kinds.size === 1 && (kinds.has('element') || kinds.has('comment'))) pytype = 'list[HtmlElement]';
      else if (kinds.size === 1 && (kinds.has('attr') || kinds.has('text'))) pytype = 'list[smart string]';
      return {
        ok: true, xpath: xpath, total: total, shown: n, truncated: total > n,
        items: items, pytype: pytype, stringExpr: detectStringExpr(xpath), ms: elapsed()
      };
    } catch (e) {
      return { ok: false, xpath: xpath, error: (e && e.message) ? e.message : String(e) };
    }
  }

  /* ---------- 元素选取（picker） ---------- */
  let pick = null;

  function cssEsc(s) {
    try { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }
    catch (e) { return String(s).replace(/["\\]/g, '\\$&'); }
  }

  // 生成与 lxml 兼容的绝对 XPath：优先 //*[@id="…"]，否则 /html/body/div[2]/a[1]
  function genXPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) {
      const id = el.id;
      let lit = null;
      if (id.indexOf('"') === -1) lit = '"' + id + '"';
      else if (id.indexOf("'") === -1) lit = "'" + id + "'";
      let uniq = false;
      try { uniq = document.querySelectorAll('[id="' + id.replace(/["\\]/g, '\\$&') + '"]').length === 1; } catch (e) { }
      if (lit && uniq) return '//*[@id=' + lit + ']';
    }
    const segs = [];
    let cur = el;
    while (cur && cur.nodeType === 1) {
      const parent = cur.parentElement;
      let seg = cur.tagName.toLowerCase();
      if (parent) {
        const same = Array.prototype.filter.call(parent.children, c => c.tagName === cur.tagName);
        if (same.length > 1) seg += '[' + (Array.prototype.indexOf.call(same, cur) + 1) + ']';
      }
      segs.unshift(seg);
      if (cur === document.documentElement) break;
      cur = parent;
    }
    return '/' + segs.join('/');
  }

  function restoreOutline(el) {
    if (!el) return;
    el.style.outline = pick.prevOutline || '';
    el.style.outlineOffset = pick.prevOutlineOffset || '';
  }

  function onPickOver(e) {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (pick.last && pick.last !== el) restoreOutline(pick.last);
    pick.prevOutline = el.style.outline;
    pick.prevOutlineOffset = el.style.outlineOffset;
    pick.last = el;
    el.style.outline = '2px solid #8cf24a';
    el.style.outlineOffset = '0';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? ' class="' + el.className.trim().split(/\s+/).slice(0, 2).join(' ') + '"' : '';
    const xp = genXPath(el);
    pick.tip.textContent = (xp || '(无法生成)') + '   <' + el.tagName.toLowerCase() + cls + '>';
    pick.tip.style.display = 'block';
    const x = Math.min(e.clientX + 14, window.innerWidth - pick.tip.offsetWidth - 8);
    const y = Math.min(e.clientY + 16, window.innerHeight - pick.tip.offsetHeight - 8);
    pick.tip.style.left = Math.max(4, x) + 'px';
    pick.tip.style.top = Math.max(4, y) + 'px';
  }

  function finishPick(cancelled) {
    if (!pick) return;
    document.removeEventListener('mouseover', onPickOver, true);
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('keydown', onPickKey, true);
    document.documentElement.classList.remove('__xph-picking');
    restoreOutline(pick.last);
    if (pick.tip) pick.tip.remove();
    pick = null;
    window.dispatchEvent(new CustomEvent('__xph-picked', { detail: cancelled ? { cancelled: true } : {} }));
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (!(el instanceof Element) || !pick) return;
    const xp = genXPath(el);
    finishPick(false);
    if (xp) window.dispatchEvent(new CustomEvent('__xph-picked', { detail: { xpath: xp } }));
  }

  function onPickKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      finishPick(true);
    }
  }

  function pickStart() {
    if (pick) return { ok: true, active: true };
    pick = { last: null, prevOutline: '', prevOutlineOffset: '', tip: null };
    const tip = document.createElement('div');
    tip.id = '__xph-pick-tip';
    tip.textContent = '移动鼠标选择元素，点击确认生成 XPath，Esc 取消';
    document.documentElement.appendChild(tip);
    pick.tip = tip;
    document.documentElement.classList.add('__xph-picking');
    document.addEventListener('mouseover', onPickOver, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onPickKey, true);
    return { ok: true };
  }

  const pickStop = () => { if (pick) finishPick(true); };

  /* ---------- 结果高亮与定位 ---------- */
  let highlighted = [];

  function clearHighlight() {
    for (const el of highlighted) el.classList.remove('__xph-hit');
    highlighted = [];
  }

  function highlight(xpath) {
    clearHighlight();
    try {
      const r = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const n = Math.min(r.snapshotLength, 500);
      for (let i = 0; i < n; i++) {
        const node = r.snapshotItem(i);
        if (node && node.nodeType === 1) {
          node.classList.add('__xph-hit');
          highlighted.push(node);
        }
      }
      return { ok: true, count: highlighted.length };
    } catch (e) {
      return { ok: false };
    }
  }

  function scrollToItem(xpath, index) {
    try {
      const r = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (index >= r.snapshotLength) return { ok: false };
      const node = r.snapshotItem(index);
      if (node) {
        const target = node.nodeType === 1 ? node : node.parentElement;
        if (target) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target.classList.add('__xph-flash');
          setTimeout(() => target.classList.remove('__xph-flash'), 1600);
        }
      }
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }

  /* ---------- 文本提取（批量 text_content，空白归一化） ---------- */
  function texts(xpath, opts) {
    opts = opts || {};
    const max = Math.max(1, Math.min(opts.max || 200, 2000));
    const maxLen = opts.maxLen || 600;
    try {
      const r = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const total = r.snapshotLength;
      const n = Math.min(total, max);
      const items = [];
      let nonText = 0;
      for (let i = 0; i < n; i++) {
        const node = r.snapshotItem(i);
        if (!node) continue;
        if (node.nodeType === 1) {
          const t = String(node.textContent || '').replace(/\s+/g, ' ').trim();
          items.push({ index: i, tag: node.tagName.toLowerCase(), text: t.slice(0, maxLen), trunc: t.length > maxLen });
        } else if (node.nodeType === 3) {
          const t = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
          items.push({ index: i, tag: '#text', text: t.slice(0, maxLen), trunc: t.length > maxLen });
        } else {
          nonText++;
        }
      }
      return { ok: true, xpath: xpath, total: total, shown: items.length, nonText: nonText, truncated: total > n, items: items };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  }

  /* ---------- BeautifulSoup 风格支持 ---------- */
  const BS4_MULTI = { 'class': 1, 'rel': 1, 'rev': 1, 'accept-charset': 1, 'headers': 1, 'accesskey': 1 };

  // BS4 中 class 等多值属性是列表，其余是字符串
  function bs4Attrs(attrib) {
    const out = {};
    for (const k of Object.keys(attrib)) {
      if (BS4_MULTI[k]) {
        out[k] = String(attrib[k]).trim().split(/\s+/).filter(Boolean);
      } else {
        out[k] = attrib[k];
      }
    }
    return out;
  }

  // 按引号/括号感知切分 XPath 路径步
  function splitPath(x) {
    const steps = [];
    const seps = [];
    let cur = '';
    let quote = null;
    let depth = 0;
    const leading = x.charAt(0) === '/';
    for (let i = 0; i < x.length; i++) {
      const ch = x.charAt(i);
      if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '[') { depth++; cur += ch; continue; }
      if (ch === ']') { depth = Math.max(0, depth - 1); cur += ch; continue; }
      if (depth === 0 && ch === '/') {
        if (x.charAt(i + 1) === '/') { seps.push('//'); i++; } else { seps.push('/'); }
        if (cur !== '') steps.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur !== '') steps.push(cur);
    return { steps: steps, seps: seps, leading: leading };
  }

  function joinSteps(parts, count) {
    let out = parts.steps[0];
    for (let i = 1; i < count; i++) {
      const sep = parts.seps[parts.leading ? i : i - 1];
      out += (sep === '//' ? '//' : '/') + parts.steps[i];
    }
    return out;
  }

  // 单步转换，成功返回 {css, approx}，失败返回 null
  function convertStep(step) {
    const m = step.match(/^([A-Za-z_][\w.:-]*|\*)((?:\[[^\][]*\])*)$/);
    if (!m) return null;
    const tag = m[1];
    let css = '';
    if (tag && tag !== '*') {
      if (!/^[a-z][\w:-]*$/i.test(tag)) return null;
      css = tag.toLowerCase();
    }
    const preds = m[2] ? m[2].match(/\[([^\][]*)\]/g) || [] : [];
    let approx = false;
    for (const p of preds) {
      const q = p.slice(1, -1).trim();
      let mm;
      if ((mm = q.match(/^@([\w:-]+)$/))) {
        css += '[' + mm[1] + ']';
      } else if ((mm = q.match(/^@([\w:-]+)\s*=\s*"([^"]*)"$/)) || (mm = q.match(/^@([\w:-]+)\s*=\s*'([^']*)'$/))) {
        const attr = mm[1];
        const val = mm[2];
        if (/['"\\]/.test(val)) return null;
        if (attr === 'id' && /^[A-Za-z_][\w-]*$/.test(val)) css += '#' + val;
        else css += '[' + attr + '="' + val + '"]';
      } else if ((mm = q.match(/^contains\(\s*@class\s*,\s*"([^"]*)"\s*\)$/)) || (mm = q.match(/^contains\(\s*@class\s*,\s*'([^']*)'\s*\)$/))) {
        if (!/^[A-Za-z0-9_-]+$/.test(mm[1])) return null;
        css += '.' + mm[1];
        approx = true; // 子串匹配 → 词匹配，语义有差异
      } else if ((mm = q.match(/^contains\(\s*@([\w:-]+)\s*,\s*"([^"]*)"\s*\)$/)) || (mm = q.match(/^contains\(\s*@([\w:-]+)\s*,\s*'([^']*)'\s*\)$/))) {
        if (/['"\\]/.test(mm[2])) return null;
        css += '[' + mm[1] + '*="' + mm[2] + '"]';
      } else if ((mm = q.match(/^starts-with\(\s*@([\w:-]+)\s*,\s*"([^"]*)"\s*\)$/)) || (mm = q.match(/^starts-with\(\s*@([\w:-]+)\s*,\s*'([^']*)'\s*\)$/))) {
        if (/['"\\]/.test(mm[2])) return null;
        css += '[' + mm[1] + '^="' + mm[2] + '"]';
      } else if (/^\d+$/.test(q)) {
        css += ':nth-of-type(' + parseInt(q, 10) + ')';
      } else if (q === 'last()') {
        css += ':last-of-type';
      } else {
        return null;
      }
    }
    return { css: css, approx: approx };
  }

  // XPath → CSS 选择器（best effort）；末尾的 /@attr、/text() 作为 tail 拆出
  function xpathToCss(xp) {
    const x = String(xp).trim();
    if (!x) return { ok: false, reason: '空表达式' };
    if (/^\(/.test(x)) return { ok: false, reason: '含括号分组' };
    if (/\|/.test(x)) return { ok: false, reason: '含 | 合并' };
    if (/::/.test(x)) return { ok: false, reason: '含轴(axis)' };

    // 先拆出尾部的 /@attr 或 /text()，再对剩余路径做函数/节点类型检查
    const parts0 = splitPath(x);
    let base = x;
    let tail = null;
    const lastTrim = (parts0.steps[parts0.steps.length - 1] || '').trim();
    if (parts0.steps.length > 1) {
      const at = lastTrim.match(/^@([\w:-]+|\*)$/);
      if (at) {
        tail = { type: at[1] === '*' ? 'anyattr' : 'attr', name: at[1] };
        base = joinSteps(parts0, parts0.steps.length - 1);
      } else if (lastTrim === 'text()') {
        tail = { type: 'text' };
        base = joinSteps(parts0, parts0.steps.length - 1);
      }
    }

    if (/text\(\)|comment\(\)|node\(\)|processing-instruction/.test(base)) return { ok: false, reason: '含节点类型（CSS 无法匹配文本节点）' };
    if (/\b(position\(\)|count\(|string\(|number\(|boolean\(|not\(|floor\(|ceil\(|round\(|normalize-space\(|translate\(|concat\(|substring)/.test(base)) return { ok: false, reason: '含不支持的函数' };

    const parts = splitPath(base);
    const n = parts.steps.length;
    if (!n) return { ok: false, reason: '无法解析' };
    const expect = parts.leading ? n : n - 1;
    if (parts.seps.length !== expect) return { ok: false, reason: '路径解析异常' };
    const cssSteps = [];
    let approx = false;
    for (let i = 0; i < n; i++) {
      const c = convertStep(parts.steps[i].trim());
      if (!c) return { ok: false, reason: '不支持的表达式：' + parts.steps[i].trim() };
      cssSteps.push(c.css);
      if (c.approx) approx = true;
    }
    let css = cssSteps[0];
    for (let i = 1; i < n; i++) {
      const sep = parts.seps[parts.leading ? i : i - 1];
      css += (sep === '//' ? ' ' : ' > ') + cssSteps[i];
    }
    return { ok: true, css: css || '*', approx: approx, tail: tail };
  }

  /* ---------- 生成 Python 复现代码（lxml / BeautifulSoup 双风格） ---------- */
  function bs4Snippet(xpath, textMode) {
    const url = location.href;
    const conv = xpathToCss(xpath);
    const imports = (textMode ? 'import re\n' : '') + '\nimport requests\nfrom bs4 import BeautifulSoup';
    let selectLine;
    let tailLoop = null;
    if (conv.ok) {
      selectLine = "results = soup.select('" + conv.css.replace(/'/g, "\\'") + "')";
      if (conv.tail && conv.tail.type === 'attr' && !textMode) {
        const name = conv.tail.name;
        tailLoop = name === '*'
          ? 'for el in results:\n    print(el.attrs)'
          : "for el in results:\n    print(el.get(" + pyStr(name) + "))";
      }
    } else {
      selectLine = '# 原 XPath 无法自动转换为 CSS 选择器（' + conv.reason + '），请手写等价选择器：\nresults = soup.select(\'在此填写CSS选择器\')';
    }
    let loop;
    if (tailLoop) {
      loop = tailLoop;
    } else if (textMode) {
      loop = [
        "texts = [re.sub(r'\\s+', ' ', el.get_text()).strip() for el in results]",
        'for t in texts:',
        '    print(t)'
      ].join('\n');
    } else {
      loop = 'for el in results:\n    print(el.name, el.attrs)';
    }
    const doc = ('页面: ' + url + '\nXPath: ' + xpath +
      (conv.ok ? ('\nCSS:   ' + conv.css + (conv.approx ? '（contains(@class) 为近似转换）' : ''))
               : ('\nCSS:   未转换（' + conv.reason + '）')))
      .replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    return [
      '# -*- coding: utf-8 -*-',
      '"""在 Python + BeautifulSoup 中复现提取（由 网络爬虫 扩展生成）',
      doc,
      '"""',
      imports,
      '',
      'URL = ' + pyStr(url),
      'HEADERS = {"User-Agent": "Mozilla/5.0"}  # 页面若需登录：F12 → 网络 → 复制请求的 Cookie 加进来',
      '',
      '# ── 方式一：requests 抓取服务器原始 HTML（不执行页面 JS）──────────────',
      '# 适用：静态页面。若页面内容由 JS 渲染（Vue/React/滚动加载），这里常常取不到元素，',
      '#      请改用方式二；面板里能看到而这里取不到，基本都是这个原因。',
      'resp = requests.get(URL, timeout=10, headers=HEADERS)',
      "soup = BeautifulSoup(resp.content, 'html.parser')   # 想更快可改用 'lxml' 解析器: pip install lxml",
      '',
      '# ── 方式二：读取扩展下载的 page.html（浏览器渲染后的 DOM，与面板所见一致）──',
      '# 用法：面板 → 下载 page.html → 注释掉上面两行 requests/soup，放开下面两行',
      "# with open('page.html', 'rb') as f:",
      "#     soup = BeautifulSoup(f.read(), 'html.parser')",
      '',
      selectLine,
      "print('len =', len(results))",
      '',
      "if len(results) == 0:",
      "    print('结果为空？按顺序排查：')",
      "    print('1) 页面由 JS 渲染 → 改用上方“方式二”读取 page.html')",
      "    print('2) 页面需要登录 → HEADERS 里补上浏览器的 Cookie')",
      "    print('3) 选择器依赖 <tbody> → 浏览器 DOM 会自动插入 tbody，原始 HTML 没有，需改写')",
      loop,
      ''
    ].join('\n');
  }

  /* ---------- 生成 parsel 风格代码 ---------- */
  function parselSnippet(xpath, textMode) {
    const url = location.href;
    const imports = (textMode ? 'import re\n' : '') + '\nimport requests\nfrom parsel import Selector';
    let loop;
    if (textMode) {
      loop = [
        "texts = [re.sub(r'\\s+', ' ', el.xpath('string(.)').get() or '').strip() for el in results]",
        'for t in texts:',
        '    print(t)'
      ].join('\n');
    } else {
      const isStr = detectStringExpr(xpath);
      loop = isStr
        ? 'for s in results:\n    print(s)'
        : 'for el in results:\n    print(el.attrib)';
    }
    const doc = ('页面: ' + url + '\nXPath: ' + xpath)
      .replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    return [
      '# -*- coding: utf-8 -*-',
      '"""在 Python + parsel 中复现提取（由 网络爬虫 扩展生成）',
      doc,
      '"""',
      imports,
      '',
      'URL = ' + pyStr(url),
      'HEADERS = {"User-Agent": "Mozilla/5.0"}  # 页面若需登录：F12 → 网络 → 复制请求的 Cookie 加进来',
      '',
      '# ── 方式一：requests 抓取服务器原始 HTML（不执行页面 JS）──────────────',
      '# 适用：静态页面。JS 渲染页（如腾讯元宝）请直接用方式二',
      'resp = requests.get(URL, timeout=10, headers=HEADERS)',
      'sel = Selector(text=resp.text)',
      '',
      '# ── 方式二：读取扩展下载的 page.html（浏览器渲染后的 DOM，与面板所见一致）──',
      '# 用法：面板 → 下载 page.html → 注释掉上面两行 requests/Selector，放开下面两行',
      "# with open('page.html', 'rb') as f:",
      "#     sel = Selector(text=f.read().decode('utf-8'))",
      '',
      'results = sel.xpath(' + pyStr(xpath) + (detectStringExpr(xpath) ? ').getall()' : ')'),
      "print('len =', len(results))",
      '',
      "if len(results) == 0:",
      "    print('结果为空？按顺序排查：')",
      "    print('1) 页面由 JS 渲染 → 改用上方“方式二”读取 page.html')",
      "    print('2) 页面需要登录 → HEADERS 里补上浏览器的 Cookie')",
      '',
      loop,
      '',
      '# parsel 习惯：字符串结果用 getall()（全部）/ get()（第一条，无则 None）',
      "# 元素结果可继续链式筛选：el.xpath('./@href') / el.css('a::attr(href)')",
      '# 文本：el.xpath("string(.)").get() 等价 lxml 的 text_content()'
    ].join('\n');
  }

  function pythonSnippet(xpath, opts) {
    if (typeof opts === 'boolean') opts = { textMode: opts }; // 兼容旧签名
    opts = opts || {};
    if (opts.style === 'bs4') return bs4Snippet(xpath, !!opts.textMode);
    if (opts.style === 'parsel') return parselSnippet(xpath, !!opts.textMode);
    const url = location.href;
    let imports = 'from lxml import html';
    let loop;
    if (opts.textMode) {
      imports = 'import re\n\nfrom lxml import html';
      loop = [
        "texts = [re.sub(r'\\s+', ' ', el.text_content()).strip() for el in results]",
        'for t in texts:',
        '    print(t)'
      ].join('\n');
    } else {
      const isStr = detectStringExpr(xpath);
      loop = isStr
        ? 'for s in results:\n    print(s)'
        : 'for el in results:\n    print(repr(el), el.attrib)';
    }
    const doc = ('页面: ' + url + '\nXPath: ' + xpath)
      .replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    return [
      '# -*- coding: utf-8 -*-',
      '"""在 Python + lxml 中复现 XPath 提取（由 网络爬虫 扩展生成）',
      doc,
      '"""',
      imports,
      '',
      'URL = ' + pyStr(url),
      '',
      '# 方式一：抓取服务器原始 HTML（等价于 requests 看到的内容，不执行页面 JS）',
      '# import requests',
      '# resp = requests.get(URL, timeout=10, headers={"User-Agent": "Mozilla/5.0"})',
      '# tree = html.fromstring(resp.content)',
      '',
      '# 方式二：使用扩展下载的 page.html（浏览器渲染后的 DOM，与面板所见一致）',
      "with open('page.html', 'rb') as f:",
      '    tree = html.fromstring(f.read())',
      '',
      'results = tree.xpath(' + pyStr(xpath) + ')',
      "print('len =', len(results))",
      "if len(results) == 0:",
      "    print('结果为空：若改用 requests 方式，注意页面可能由 JS 渲染或需要登录 Cookie；也可直接用当前 page.html 复跑')",
      loop,
      ''
    ].join('\n');
  }

  /* ---------- 基础样式（高亮 / 选取提示） ---------- */
  if (!document.getElementById('__xph-base-style')) {
    const style = document.createElement('style');
    style.id = '__xph-base-style';
    style.textContent = [
      '.__xph-hit { outline: 2px solid #8cf24a !important; outline-offset: 0 !important; background-color: rgba(140,242,74,.08) !important; }',
      '.__xph-flash { animation: __xphflash 1.2s ease 1; }',
      '@keyframes __xphflash { 0% { box-shadow: inset 0 0 0 4px rgba(140,242,74,.75); } 100% { box-shadow: inset 0 0 0 4px rgba(140,242,74,0); } }',
      '#__xph-pick-tip { position: fixed; z-index: 2147483647; pointer-events: none; display: none; background: #10131a; color: #d6e2ff; border: 1px solid #2c3550; border-radius: 8px; padding: 6px 10px; font: 12px/1.5 ui-monospace, Consolas, monospace; max-width: 520px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 6px 24px rgba(0,0,0,.45); }',
      'html.__xph-picking, html.__xph-picking * { cursor: crosshair !important; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  /* ---------- 对外 API ---------- */
  window.__xph = {
    extract: extract,
    texts: texts,
    bs4Attrs: bs4Attrs,
    xpathToCss: xpathToCss,
    pythonSnippet: pythonSnippet,
    pickStart: pickStart,
    pickStop: pickStop,
    highlight: highlight,
    clearHighlight: clearHighlight,
    scrollToItem: scrollToItem,
    py: { str: pyStr, dict: pyDict, addr: fakeAddr },
    fmtScalar: fmtScalar
  };
})();
