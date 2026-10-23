# 网络爬虫（Chrome 扩展）

在任意网页上直接运行 XPath，提取**标题、链接、图片、相关文本、属性**等数据，支持 **Python lxml / BeautifulSoup（BS4）/ parsel 三种风格**展示，并生成可在 Python 中复现的代码。

- Manifest V3，仅使用 `activeTab` 临时权限——只有你点击扩展时才访问当前标签页，不申请"读取所有网站数据"
- 完全本地运行，无任何网络请求
- 浏览器与 lxml 同为 **XPath 1.0**，表达式可直接互换

## 安装

1. 解压 `xpath-lxml-helper.zip`（或直接使用 `xpath-lxml-helper` 文件夹）
2. Chrome 打开 `chrome://extensions`
3. 右上角打开 **开发者模式**
4. 点击 **加载已解压的扩展程序**，选择 `xpath-lxml-helper` 文件夹

Edge 同理（`edge://extensions`）。

## 使用

### 浮动面板（主工作台）

- 按 **Ctrl+Shift+X**（或点工具栏图标 → "打开浮动面板"）在当前页面呼出
- 输入 XPath 回车运行；或点击预设按钮：标题、链接、链接地址、图片、图片地址、段落、标题层级、Meta、带 id 元素、class 含 main
- **◉ 选取元素**：在页面上点击任意元素，自动生成 XPath（优先 `//*[@id="…"]`，否则绝对路径 `/html/body/div[2]/a[1]`），Esc 取消；选取后直接给出该元素的**文本**（`text_content()`），并可一键切换 `/text()`（直接文本节点）或 `//text()`（全部后代文本）
- **提取文本**：把当前 XPath 命中元素的文本批量提取（空白归一化，等价 `text_content()`），点击行可在页面中定位，支持复制全部文本、生成对应 Python 代码
- 命中元素可**高亮**显示；点击结果卡片标题可在页面中**定位并闪烁**该元素
- 历史记录（最近 20 条）、结果条数、面板位置均自动保存
- 面板可拖动，`✕` 或再次 Ctrl+Shift+X 关闭
- **风格: lxml / BS4 / parsel**：点击循环切换展示与代码生成风格（详见下文“BeautifulSoup 风格”与“parsel 风格”）

### lxml 风格输出

```
>>> results = tree.xpath('//a')
[<Element a at 0x7f2a1c000000>, <Element a at 0x7f2a1c000038>, …]
# len(results) = 12 · list[HtmlElement] · 1.8 ms
```

每个元素展开显示：

```
[0] <Element a at 0x7f2a1c000000>
    .tag            'a'
    .text           '首页'
    .tail           None
    .attrib         {'href': '/home', 'class': 'nav'}
    ▸ .text_content() · outerHTML
```

### 一键复现到 Python

- **生成 Python 代码**：复制完整脚本（见下），粘进本地即可运行
- **下载 page.html**：保存当前渲染后的 DOM，与脚本配合使用

```python
from lxml import html

# 方式一：requests 抓取服务器原始 HTML（不执行页面 JS）
# resp = requests.get(URL, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
# tree = html.fromstring(resp.content)

# 方式二：读取扩展下载的 page.html（渲染后 DOM，与面板所见一致）
with open('page.html', 'rb') as f:
    tree = html.fromstring(f.read())

results = tree.xpath('//a')
for el in results:
    print(repr(el), el.attrib)
```

“提取文本”模式下生成的代码用 `re.sub(r'\s+', ' ', el.text_content()).strip()` 归一化空白，与面板显示和复制的内容完全一致。

## BeautifulSoup（BS4）风格

点面板工具栏 **“风格: lxml”** 按钮切换到 BS4 风格（再点切回，选择自动保存），标题旁徽标同步变化。切换后：

```
# XPath: //a  →  CSS: a
>>> results = soup.select('a')
[<a class="nav" href="/home">首页</a>, …]
# len(results) = 12 · list[Tag] · 1.5 ms
```

每个元素展开显示 BS4 惯用字段：

```
[0] <a class="nav" href="/home">首页</a>
    .name        'a'
    .attrs       {'href': '/home', 'class': ['nav']}
    .get_text()  '首页'
    ▸ outerHTML · get_text() 全文
```

注意：BS4 中 `class` 等多值属性（class、rel 等）是**列表**，与 `el.attrs` 行为一致。

**XPath → CSS 自动转换规则**（BS4 不支持 XPath，扩展做 best-effort 转换并显示在代码行上方）：

| XPath | CSS | 说明 |
|---|---|---|
| `//a` | `a` | |
| `/html/body/div` | `html > body > div` | `/` → 子级，`//` → 后代 |
| `//*[@id="main"]` | `#main` | |
| `//a[@href]` | `a[href]` | |
| `//a[@class="nav"]` | `a[class="nav"]` | 精确匹配，语义与 XPath 相同 |
| `//div[contains(@class,"btn")]` | `div.btn` | ⚠ 近似：子串匹配 → 词匹配 |
| `//a[contains(@href,"page")]` | `a[href*="page"]` | |
| `//a[starts-with(@href,"https")]` | `a[href^="https"]` | |
| `//li[3]` / `//li[last()]` | `li:nth-of-type(3)` / `li:last-of-type` | |
| `//a/@href` | `a` + `el.get('href')` | 尾部属性自动拆出，代码注释给出取值写法 |

无法转换时（如 `contains(text(),…)`、函数、轴、`|` 合并），代码行会注明原因并留 `soup.select('在此填写CSS选择器')` 占位；**结果展示不受影响**（展示仍来自 XPath 实际运行）。

BS4 模式下“生成 Python 代码”输出：

```python
import requests
from bs4 import BeautifulSoup

resp = requests.get(URL, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
soup = BeautifulSoup(resp.content, 'html.parser')   # 可改用 'lxml' 解析器

results = soup.select('a')
for el in results:
    print(el.name, el.attrs)
```

字段对应关系：lxml `.tag` ↔ BS4 `.name`；`.attrib` ↔ `.attrs`（class 为列表）；`.text_content()` ↔ `.get_text()`。

## parsel 风格

点“风格”按钮循环切换：**lxml → BS4 → parsel → lxml**。parsel 是 Scrapy 的解析库，**原生支持 XPath**，因此表达式原样可用，风格差异在于调用习惯：

```
>>> sel.xpath('//a')
[<Selector query='//a' data='<a class="nav" href="/home">首页</a>'>, …]
# len(results) = 12 · SelectorList · 1.6 ms
```

元素卡片显示 parsel 惯用调用：

```
[0] <Selector query='//a' data='<a class="nav" href="/home">首页</a>'>
    .attrib   {'href': '/home', 'class': 'nav'}
    .get()    '<a class="nav" href="/home">首页</a>'
    .xpath('string(.)').get()   '首页'
    ▸ outerHTML · string(.) 全文
```

核心习惯（生成的代码与提示都会体现）：

| 场景 | parsel 写法 |
|---|---|
| 全部字符串 | `sel.xpath('//a/@href').getall()` |
| 第一条（无则 None） | `sel.xpath('//title/text()').get()` |
| 元素属性字典 | `el.attrib` |
| 元素全部文本 | `el.xpath('string(.)').get()` |
| 继续筛选 | `el.xpath('./@href')`、`el.css('a::attr(href)')`、`el.css('::text')` |

生成的 parsel 代码：

```python
from parsel import Selector

resp = requests.get(URL, timeout=10, headers=HEADERS)
sel = Selector(text=resp.text)

results = sel.xpath('//a')
for el in results:
    print(el.attrib)

# 字符串结果用 getall()/get()
# hrefs = sel.xpath('//a/@href').getall()
```

## 浏览器 XPath ↔ lxml 结果类型映射

| XPath 写法 | 浏览器 | lxml 返回 | 本扩展展示 |
|---|---|---|---|
| `//a` | 元素集合 | `list[HtmlElement]` | `<Element a at 0x…>` repr 列表 |
| `//a/@href` | 属性字符串集合 | `list[smart string]` | 字符串字面量列表 |
| `//title/text()` | 文本节点集合 | `list[smart string]` | 字符串字面量列表 |
| `string(//title)` | 字符串 | `str` | `'…'` |
| `count(//a)` | 数字 | `float`（如 `3.0`） | `3.0` |
| `boolean(//a[@id])` | 布尔 | `bool` | `True` / `False` |

元素卡片字段与 lxml 属性一一对应：`.tag`（HTML 标签统一小写，与 lxml html 解析一致）、`.text`（首段文本）、`.tail`（元素后的文本）、`.attrib`（属性字典，文档顺序）、`.text_content()`（全部后代文本）。

## 已知边界

- **XPath 1.0**：与 lxml/libxml2 相同版本，不支持 XPath 2.0+ 函数
- **不穿透 Shadow DOM / iframe**：只解析主文档
- **XHTML/SVG 命名空间**：带命名空间的元素建议用 `//*[local-name()='svg']`
- **text() 与 text_content()**：`text()` 返回文本节点（smart string）；`.text` 是元素的首段文本；`.text_content()` 才是全部后代文本
- **受限页面**：`chrome://`、扩展商店、PDF 查看器等无法注入
- **page.html 为渲染后 DOM**：若需要服务器原始 HTML（未执行 JS），用脚本中注释的 `requests` 方式

## 常见问题

**报错 "Cannot access a chrome-extension:// URL of different extension" / 弹窗提示无法注入？**

当前标签页属于其他扩展——最常见是**内置 PDF 查看器打开的 PDF**、其他扩展自己的页面（某扩展的选项页 / 首页 / 被第三方扩展接管的新标签页等）。浏览器安全机制禁止扩展互相注入，**切换到普通网页（https://…）即可**。`chrome://` 等浏览器内部页同理。快捷键失败时扩展图标会出现短暂红色 ✕ 角标。

打开弹窗时会**自动自检**：可注入时显示页面真实地址并提示 ✓；不可注入时立即给出原因。判断技巧：看地址栏，若以 `chrome-extension://` 或 `chrome://` 开头就是特殊页面。

**本地 HTML 文件打不开？**
到 "管理扩展 → 本扩展 → 详情"，开启"允许访问文件网址"。

**生成的 Python 代码运行后 len = 0？**

面板看到的是浏览器**渲染后**的 DOM，而 requests 拿到的是服务器**原始 HTML**（不执行 JS）。按顺序排查：

1. **页面由 JS 渲染**（最常见，SPA / 动态内容）：面板点 **下载 page.html**，在生成代码里切换到"方式二"读取该文件——它与面板所见完全一致。
2. **页面需要登录**：把浏览器 Cookie 加进 HEADERS（F12 → 网络 → 复制请求的 Cookie）。
3. **选择器依赖 `<tbody>`**：浏览器 DOM 会自动给 `<table>` 插入 tbody，而 html.parser/lxml 解析原始 HTML 时不会——选择器去掉 tbody 层级或改用 page.html。

v1.2.1 起生成的代码自带以上排查提示（len = 0 时自动打印）。

## 权限说明

| 权限 | 用途 |
|---|---|
| `activeTab` | 仅在你点击扩展时临时访问当前标签页 |
| `scripting` | 向当前标签页注入解析脚本 |
| `storage` | 本地保存历史记录与设置 |
| `clipboardWrite` | 复制结果与代码 |

无任何网络权限，数据不出本机。

## 文件结构

```
xpath-lxml-helper/
├── manifest.json      # MV3 清单
├── background.js      # Service Worker：Ctrl+Shift+X 注入面板
├── lib.js             # 共享解析库：XPath 提取、lxml/BS4/parsel 风格序列化、XPath→CSS 转换、选取、高亮
├── panel.js           # 页面内浮动工作台
├── popup.html/css/js  # 工具栏弹窗
├── icons/             # 图标
└── README.md
```

## 更新日志

- **v1.3.0**（2026-10-23）：标题去掉 `//` 前缀；新增 **parsel 库风格**（`sel.xpath()` + `getall()/get()` 习惯、`<Selector query=… data=…>` 展示、对应 Python 代码生成），风格按钮循环切换 lxml → BS4 → parsel
- **v1.2.1**（2026-10-22）：生成代码内置空结果（len = 0）排查提示（JS 渲染页 / 登录 Cookie / tbody 差异）；HEADERS 单独提出方便补 Cookie
- **v1.2.0**（2026-10-22）：扩展更名为“网络爬虫”；新增 **BeautifulSoup 风格**（XPath→CSS 自动转换、`.name/.attrs/.get_text()`、BS4 代码生成）
- **v1.1.0**（2026-10-22）：选取元素直接给出文本并可一键切 `/text()`、`//text()`；新增“提取文本”批量提取视图（空白归一化、点击定位、复制全部、生成代码）
- **v1.0.1**（2026-10-22）：修复受限页面（PDF/其他扩展页）注入的报错提示；弹窗打开自动自检；修复复制按钮提示不显示
- **v1.0.0**（2026-10-22）：首个版本：XPath 浮动面板、元素选取、高亮定位、预设提取、lxml 风格展示、Python 代码生成、page.html 下载
