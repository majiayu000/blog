# Blog SPEC

个人博客站点。内容形态是**已渲染好的整页 HTML**，不是 markdown。

## 核心前提

一篇文章 = 一个自包含目录：`src/posts/<slug>/index.html` + 同目录内的资源。
文章 HTML **原样输出**，构建过程不修改其内容。

生成器只负责"外壳"：首页、标签页、归档、搜索索引、RSS。

**代价：外壳的导航不会进入文章页。** 所以每篇文章必须自己带一个回 `/` 的链接，
否则读者点进去就是死胡同。这是"文章逐字节不被改动"换来的，不是疏漏——
要消除它就只能让构建往文章里注入 HTML，那会推翻上面这条核心前提。

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
```

一篇文章因此是**单文件自洽**的，复制走仍是完整的一篇。

## Fail closed

缺 `<title>` 或 `<date>`、日期格式非法、slug 重复 —— **构建直接失败并指出是哪个文件**。
不用文件名兜底、不用当天日期兜底。宁可构建红，不要站上线后悄悄显示错误的元数据。

## 目录结构

```
blog/
├── eleventy.config.js      # 11ty 配置：passthrough 文章目录 + 忽略模板化
├── lib/posts.js            # 扫描 + 解析文章元数据（唯一有逻辑的地方）
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
    └── posts/<slug>/index.html
```

## 构建流程

```
bun run build
  ├─ eleventy          → _site/（文章 passthrough + 外壳页面）
  └─ pagefind          → _site/pagefind/（索引构建后的 HTML）
```

`bun run dev` 起本地预览，端口 5567（避开已占用的 5568/5569）。

## 部署

产物 `_site/` 是纯静态目录，可直接交给 Cloudflare Pages：
构建命令 `bun run build`，输出目录 `_site`。域名待定，先用 `*.pages.dev`。

## 验证

- `bun test` —— 元数据解析 + fail-closed 行为
- `bun run build` —— 构建通过，`_site/` 内文章 HTML 与源文件逐字节一致
