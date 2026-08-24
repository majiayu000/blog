# blog

[![CI](https://github.com/majiayu000/blog/actions/workflows/ci.yml/badge.svg)](https://github.com/majiayu000/blog/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Personal blog at [blog.silencestar.com](https://blog.silencestar.com).

Posts are **fully rendered, self-contained HTML pages**. The generator preserves
their authored content and appends controlled article tools and an afterword at build time for SEO,
navigation, reading time, table of contents and comments. Home, topics, tags, archive, search, RSS,
sitemap and the real 404 page remain generated separately.

Built with [Eleventy](https://11ty.dev) and [Pagefind](https://pagefind.app),
deployed to Cloudflare Pages.

架构决策与取舍见 [SPEC.md](SPEC.md)（中文）。

## Getting started

```bash
bun install
bun run dev      # preview at http://localhost:5567
bun run build    # output to _site/
bun test         # metadata parsing and fail-closed behaviour
```

## Writing a post

Create `src/posts/<slug>/index.html`. The directory name becomes the URL.
Keep assets in the same directory and reference them with relative paths —
never `../`, or the post breaks once it is moved. Remote stylesheets, scripts,
fonts and media fail the build; normal source links remain allowed.

Metadata lives in the post's own `<head>`, so no sidecar config file is needed
and a post stays self-contained when copied elsewhere:

```html
<title>Post title</title>                        <!-- required -->
<meta name="date"        content="2026-07-29">   <!-- required -->
<meta name="description" content="One-line summary">
<meta name="tags"        content="architecture, tooling">
<meta name="draft"       content="true">         <!-- excluded from output -->
<meta name="featured"    content="true">         <!-- homepage editor's pick -->
<meta name="updated"     content="2026-08-24">   <!-- optional last update -->
```

The homepage shows one editor's pick and four recent posts. If several posts
are marked `featured`, the newest one wins; if none are marked, the newest post
is used so the homepage still has a lead story.

**Fail closed:** a missing title or date, an invalid date, a remote resource,
or two slugs that collide will *fail the build* and name the offending file.
Nothing is inferred from the directory name and no date is defaulted to today —
a red build beats a site that silently shows wrong metadata.

**Keep a link back to `/` in the post itself.** The generated afterword also
links home, but the source article should remain portable and navigable before
it goes through this site's build.

Every public post must match one of the five curated reading paths in
`lib/posts.js`. Raw tags and their existing URLs remain available as a secondary
index, while the homepage and `/tags/` lead with the stable reading paths.
Pagefind scans only `posts/*/index.html`, so search results never contain tag,
archive or topic pages.

## Configuration

Site details come from environment variables (see `src/_data/site.js`):

| Variable | Default |
|---|---|
| `SITE_TITLE` | `Silent Star` |
| `SITE_DESCRIPTION` | `关于 AI 工具、Agent 架构与工程实践的独立记录。` |
| `SITE_URL` | `https://blog.silencestar.com` |
| `SITE_AUTHOR` | empty |
| `SITE_AUTHOR_URL` | `https://github.com/majiayu000` |
| `SITE_LANG` | `zh-CN` |
| `GISCUS_ENABLED` | `true` |
| `GISCUS_REPO` | `majiayu000/blog` |
| `GISCUS_REPO_ID` | `R_kgDOTm_R6Q` |
| `GISCUS_CATEGORY` | `Announcements` |
| `GISCUS_CATEGORY_ID` | `DIC_kwDOTm_R6c4DEEKR` |
| `PORT` | `5567` |

`SITE_URL` determines absolute links in RSS, canonical metadata and the sitemap.
`GISCUS_ENABLED` accepts only `true` or `false`. Enabling it without a complete
repository/category configuration fails the build instead of silently removing
the comment UI.

Comments use the repository's `Announcements` category and are mapped by article
pathname. The repository must keep Discussions enabled and the
[giscus app](https://github.com/apps/giscus) installed. Set `GISCUS_ENABLED=false`
for a third-party-free preview or emergency rollback. The giscus script is not
requested until a reader approaches the comment section.

The build generates a 1200×630 PNG social card for the site and every post under
`_site/og/`. Cards intentionally use the stable ASCII slug as their visual title;
the HTML Open Graph title continues to carry the full Chinese article title.

For large raster images, keep the original PNG fallback and add a WebP sibling
through `<picture>`. Declare `width` and `height`, use `decoding="async"`, and add
`loading="lazy"` to images below the opening viewport. The training-report post
is the reference implementation.

## Deployment

Cloudflare Pages, connected to this repository:

- Build command: `bun install --frozen-lockfile && bun run build`
- Output directory: `_site`
- Environment variable: `BUN_VERSION=1.3.14`
- Custom domain: `blog.silencestar.com`

The install step is spelled out on purpose: the Pages build image installs the
Bun runtime but does not install dependencies on its own for this project, so a
bare `bun run build` fails with `eleventy: command not found`.

`src/_headers` ships the cache policy. CSS, local JS and the Pagefind bundle have no content
hash in their filenames, so they deliberately use a short max-age instead of
`immutable` — otherwise a changed file keeps its URL and visitors are stuck with
a stale copy that cannot be invalidated.

Media currently ships with the site. If large videos or images arrive later,
move them to object storage (R2) with **content-hashed filenames** and rewrite
references at publish time; the site architecture does not need to change.

## License

[MIT](LICENSE)
