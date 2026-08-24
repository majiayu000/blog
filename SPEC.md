# Blog SPEC

个人博客站点。内容形态是**已渲染好的整页 HTML**，不是 markdown。

## 核心前提

一篇文章 = 一个自包含目录：`src/posts/<slug>/index.html` + 同目录内的资源。
源文章 HTML 保持自包含，作者写下的正文和样式不由模板引擎改写。

生成器只负责"外壳"：首页、专题/标签页、归档、搜索索引、RSS。

构建完成后，站点拥有一个受控的文章增强步骤。它只在 `</head>` 和 `</body>`
前追加由仓库维护的 SEO 元数据、局部样式、阅读工具和 afterword，不改写源文章
已有字节。增强器遇到结构不完整、重复注入或配置不完整时直接失败。

文章仍不套用外壳模板，各篇可以保留完全不同的视觉。统一导航、继续阅读和评论
只出现在正文后的 afterword；每篇文章自己的回 `/` 链接仍然是无脚本环境下的必要退路。

## 文章增强边界

增强器输出以下内容：

- canonical、Open Graph、Twitter Card 和 article 元数据；
- 构建期生成的 1200×630 PNG 分享卡片；
- 同站点的 `post-enhancement.css` / `post-enhancement.js` / `search-shortcut.js`；
- 预计阅读时间、作者信息和由现有二级标题生成的页内目录；
- 更新一篇、更早一篇、继续阅读、复制链接和回到首页；
- 可选的 giscus 评论区；
- 可选的第一方分析脚本，以及仅在提供 token 时注入的 Cloudflare Web Analytics beacon。

源文章继续禁止远程样式、脚本、字体和媒体。giscus 与 Cloudflare Web Analytics
的远程脚本只能由增强器或外壳根据固定站点配置生成，不能写进文章源文件。
评论脚本只在读者接近评论区时加载；关闭评论时不加载第三方资源；开启评论但
缺少 repo/category ID 时构建失败，不能静默隐藏评论。分析开启但缺少 endpoint、
或 token 格式非法时同样构建失败。继续阅读只推荐同主专题或标签交集大于 0 的文章，
不用日期把无关文章填满三个空位。

## 内容发现

原始标签继续来自文章 `<meta name="tags">`，既有 `/tags/<tag>/` URL 保留，避免旧链接失效。
它们是辅助索引，不进入站点地图，也不参与站内全文搜索。

首页和主题入口使用五个稳定的编辑专题：产品 X-Ray、Agent 架构、工具与运行时实测、
模型与训练、技术人物与历史。专题由现有标签按优先级归类，每篇文章只进入一个主专题；
无法归类时直接构建失败，防止新文章悄悄消失在内容导航之外。

Pagefind 只扫描 `posts/*/index.html`。文章 afterword 已带 `data-pagefind-ignore`，搜索结果
因此只来自文章自身，不混入首页、归档、专题、标签、404 或评论内容。

## 选型

| 层 | 用什么 | 理由 |
|---|---|---|
| 生成器 | Eleventy (11ty) v3 | 把 `.html` 当一等公民，不强迫转 markdown |
| 搜索 | Pagefind | 直接索引构建后的 HTML，纯静态无后端 |
| 托管 | Cloudflare Pages | 免费、全球 CDN、自动 HTTPS |
| 分析 | 第一方 `/api/event` + 可选 CF Web Analytics | 不把 GA 写进文章源；可关；配置不完整则构建失败 |
| 媒体 | 先自包含在文章目录内 | 起步内容量小，不上 R2 |

排除：Docusaurus / VitePress / MkDocs / Jekyll —— markdown-first，塞整页 HTML 是逆水行舟。

**R2 是后续插入点，不是现在的需求。** 等真出现视频或超大图，再把资源外置成对象存储，
届时需要的是"内容哈希命名 + 发布时引用改写"，架构不用重构。

## 元数据来源

不引入 `meta.json` 之类的伴随文件。元数据从文章 HTML 的 `<head>` 里读：

```html
<title>文章标题</title>                             <!-- 必需 -->
<meta name="date" content="2026-07-29">             <!-- 必需，YYYY-MM-DD -->
<meta name="description" content="一句话摘要">       <!-- 可选 -->
<meta name="tags" content="架构, 工具链">            <!-- 可选，逗号分隔 -->
<meta name="draft" content="true">                  <!-- 可选，草稿不进产物 -->
<meta name="featured" content="true">               <!-- 可选，首页编辑推荐 -->
<meta name="updated" content="2026-08-24">           <!-- 可选，最后更新日期 -->
```

一篇文章因此是**单文件自洽**的，复制走仍是完整的一篇。

首页只展示一篇编辑推荐和四篇最新文章。多篇标记为 `featured` 时取日期最新的一篇；
没有标记时回退到最新文章，避免首页出现空的主推区。

## Fail closed

缺 `<title>` 或 `<date>`、日期格式非法、slug 重复、引用远程样式/脚本/字体/媒体、
公开文章无法归入五个主专题、评论或分析已启用但配置不完整
—— **构建直接失败并指出是哪个文件**。普通的外部来源链接不受影响。
不用文件名兜底、不用当天日期兜底。宁可构建红，不要站上线后悄悄显示错误的元数据。

## 目录结构

```
blog/
├── eleventy.config.js      # 11ty 配置：passthrough 文章目录 + 忽略模板化
├── functions/api/event.js  # Cloudflare Pages Function：第一方埋点入口
├── lib/posts.js            # 扫描 + 解析文章元数据（唯一有逻辑的地方）
├── lib/enhance-posts.js    # 为构建产物追加 SEO 与 afterword
├── lib/posts.test.js       # 解析与 fail-closed 行为的测试
└── src/
    ├── _data/site.js       # 站点配置，从环境变量读，带默认值
    ├── _data/blog.js       # global data：调用 lib/posts.js
    ├── _includes/shell.njk # 外壳布局（唯一模板 + 内联样式）
    ├── index.njk           # 首页：文章列表
    ├── tags.njk            # 每个标签一页
    ├── archive.njk         # 按年归档
    ├── search.njk          # Pagefind 搜索页
    ├── feed.njk            # RSS
    ├── 404.njk / sitemap.njk / robots.njk
    ├── css/post-enhancement.css
    ├── js/post-enhancement.js
    ├── js/search-shortcut.js
    ├── js/analytics.js
    └── posts/<slug>/index.html
```

## 构建流程

```
bun run build
  ├─ eleventy          → _site/（文章 passthrough + 外壳页面）
  │  └─ eleventy.after → 为文章产物追加 SEO 与 afterword
  └─ pagefind          → _site/pagefind/（仅索引 posts/*/index.html）
```

`bun run dev` 起本地预览，端口 5567（避开已占用的 5568/5569）。

## 部署

产物 `_site/` 是纯静态目录，可直接交给 Cloudflare Pages：
构建命令 `bun run build`，输出目录 `_site`，正式域名是 `blog.silencestar.com`。

评论使用 GitHub Discussions + giscus。仓库必须公开、开启 Discussions、安装 giscus
App，并提供固定 category。配置由 `src/_data/site.js` 读取；非敏感 ID 可以作为站点
默认值，部署环境可以覆盖。

第一方埋点由仓库根目录 `functions/` 提供。Cloudflare Pages 把它映射到 `/api/event`，
不进入 `_site/`。列表页和文章页的分析脚本分别由外壳和增强器注入。

## 验证

- `bun test` —— 元数据解析 + fail-closed 行为
- `bun run build` —— 构建通过，文章正文保持不变，增强标记只出现一次
- 随机不存在路径返回 Cloudflare 使用的 `/404.html`，不能回退首页并返回 200
