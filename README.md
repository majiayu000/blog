# Blog

个人博客。内容是**已渲染好的整页 HTML**，构建时原样输出，一个字节都不改。
生成器只负责外壳：首页、标签、归档、搜索、RSS。

架构决策与取舍见 [SPEC.md](SPEC.md)。

## 用法

```bash
bun install
bun run dev      # 本地预览 http://localhost:5567
bun run build    # 产出 _site/
bun test         # 元数据解析与 fail-closed 行为
```

## 写一篇文章

新建 `src/posts/<slug>/index.html`，目录名就是 URL。资源放同目录，用相对路径引用，
不要用 `../` 跨出去——否则文章被搬走就会破图。

元数据写在文章自己的 `<head>` 里，不需要额外的配置文件：

```html
<title>文章标题</title>                          <!-- 必需 -->
<meta name="date"        content="2026-07-29">   <!-- 必需 -->
<meta name="description" content="一句话摘要">    <!-- 可选 -->
<meta name="tags"        content="架构, 工具链">  <!-- 可选，逗号分隔 -->
<meta name="draft"       content="true">         <!-- 可选，草稿不进产物 -->
```

缺 `title`/`date`、日期非法、slug 冲突 → **构建失败并指出是哪个文件**，不做兜底。

`src/posts/how-posts-work/` 本身就是一篇可参照的范例。

## 配置

站点信息走环境变量，没有硬编码在模板里（见 `src/_data/site.js`）：

| 变量 | 默认值 |
|---|---|
| `SITE_TITLE` | `Blog` |
| `SITE_DESCRIPTION` | 空 |
| `SITE_URL` | `http://localhost:5567` |
| `SITE_AUTHOR` | 空 |
| `SITE_LANG` | `zh-CN` |
| `PORT` | `5567` |

`SITE_URL` 决定 RSS 里的绝对链接，**部署前必须设成正式域名**。

## 部署（Cloudflare Pages）

构建命令 `bun run build`，输出目录 `_site`，并在 Pages 环境变量里设好 `SITE_URL` 等。
产物是纯静态目录，换 Netlify / Vercel / GitHub Pages 同样可用。

媒体文件目前跟站点一起走。等真出现视频或超大图再考虑外置到 R2（对象存储），
届时需要的是"内容哈希命名 + 发布时引用改写"，站点架构不用重构。
