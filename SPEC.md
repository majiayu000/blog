# Blog SPEC

个人博客站点。内容形态是**已渲染好的整页 HTML**，不是 markdown。

## 核心前提

一篇文章 = 一个自包含目录：`src/posts/<slug>/index.html` + 同目录内的资源。
源文章 HTML 保持自包含，作者写下的正文和样式不由模板引擎改写。

生成器只负责"外壳"：首页、标签页、归档、搜索索引、RSS。

构建完成后，站点拥有一个受控的文章增强步骤。它只在 `</head>` 和 `</body>`
前追加由仓库维护的 SEO 元数据、局部样式、阅读工具和 afterword，不改写源文章
已有字节。增强器遇到结构不完整、重复注入或配置不完整时直接失败。

文章仍不套用外壳模板，各篇可以保留完全不同的视觉。统一导航、继续阅读和评论
只出现在正文后的 afterword；每篇文章自己的回 `/` 链接仍然是无脚本环境下的必要退路。

## 文章增强边界

增强器输出以下内容：

- canonical、Open Graph、Twitter Card 和 article 元数据；
- 同站点的 `post-enhancement.css` / `post-enhancement.js`；
- 更新一篇、更早一篇、继续阅读、复制链接和回到首页；
- 可选的 giscus 评论区。

源文章继续禁止远程样式、脚本、字体和媒体。giscus 的远程脚本只能由增强器根据
固定站点配置生成，不能写进文章源文件。关闭评论时不加载第三方资源；开启评论但
缺少 repo/category ID 时构建失败，不能静默隐藏评论。

## 选型

| 层 | 用什么 | 理由 |
|---|---|---|
| 生成器 | Eleventy (11ty) v3 | 把 `.html` 当一等公民，不强迫转 markdown |
| 搜索 | Pagefind | 直接索引构建后的 HTML，纯静态无后端 |
| 托管 | Cloudflare Pages | 免费、全球 CDN、自动 HTTPS |
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
```

一篇文章因此是**单文件自洽**的，复制走仍是完整的一篇。

首页只展示一篇编辑推荐和四篇最新文章。多篇标记为 `featured` 时取日期最新的一篇；
没有标记时回退到最新文章，避免首页出现空的主推区。

## Fail closed

缺 `<title>` 或 `<date>`、日期格式非法、slug 重复、引用远程样式/脚本/字体/媒体
—— **构建直接失败并指出是哪个文件**。普通的外部来源链接不受影响。
不用文件名兜底、不用当天日期兜底。宁可构建红，不要站上线后悄悄显示错误的元数据。

## 目录结构

```
blog/
├── eleventy.config.js      # 11ty 配置：passthrough 文章目录 + 忽略模板化
├── lib/posts.js            # 扫描 + 解析文章元数据（唯一有逻辑的地方）
├── lib/enhance-posts.js    # 为构建产物追加 SEO 与 afterword
├── lib/posts.test.js       # 解析与 fail-closed 行为的测试
└── src/
    ├── _data/site.js       # 站点配置，从环境变量读，带默认值
    ├── _data/posts.js      # global data：调用 lib/posts.js
    ├── _includes/shell.njk # 外壳布局（唯一模板 + 内联样式）
    ├── index.njk           # 首页：文章列表
    ├── tags.njk            # 每个标签一页
    ├── archive.njk         # 按年归档
    ├── search.njk          # Pagefind 搜索页
    ├── feed.njk            # RSS
    ├── 404.njk / sitemap.njk / robots.njk
    ├── css/post-enhancement.css
    ├── js/post-enhancement.js
    └── posts/<slug>/index.html
```

## 构建流程

```
bun run build
  ├─ eleventy          → _site/（文章 passthrough + 外壳页面）
  │  └─ eleventy.after → 为文章产物追加 SEO 与 afterword
  └─ pagefind          → _site/pagefind/（索引增强后的 HTML）
```

`bun run dev` 起本地预览，端口 5567（避开已占用的 5568/5569）。

## 部署

产物 `_site/` 是纯静态目录，可直接交给 Cloudflare Pages：
构建命令 `bun run build`，输出目录 `_site`，正式域名是 `blog.silencestar.com`。

评论使用 GitHub Discussions + giscus。仓库必须公开、开启 Discussions、安装 giscus
App，并提供固定 category。配置由 `src/_data/site.js` 读取；非敏感 ID 可以作为站点
默认值，部署环境可以覆盖。

## 验证

- `bun test` —— 元数据解析 + fail-closed 行为
- `bun run build` —— 构建通过，文章正文保持不变，增强标记只出现一次
- 随机不存在路径返回 Cloudflare 使用的 `/404.html`，不能回退首页并返回 200
