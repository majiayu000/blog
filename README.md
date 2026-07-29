# blog

[![CI](https://github.com/majiayu000/blog/actions/workflows/ci.yml/badge.svg)](https://github.com/majiayu000/blog/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Personal blog at [blog.silencestar.com](https://blog.silencestar.com).

Posts are **fully rendered, self-contained HTML pages**, copied to the output
byte-for-byte. The generator only builds the shell around them: home, tags,
archive, search and RSS. It never touches post content.

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
never `../`, or the post breaks once it is moved.

Metadata lives in the post's own `<head>`, so no sidecar config file is needed
and a post stays self-contained when copied elsewhere:

```html
<title>Post title</title>                        <!-- required -->
<meta name="date"        content="2026-07-29">   <!-- required -->
<meta name="description" content="One-line summary">
<meta name="tags"        content="architecture, tooling">
<meta name="draft"       content="true">         <!-- excluded from output -->
```

**Fail closed:** a missing title or date, an invalid date, or two slugs that
collide will *fail the build* and name the offending file. Nothing is inferred
from the directory name and no date is defaulted to today — a red build beats a
site that silently shows wrong metadata.

**Include a link back to `/` in the post itself.** The shell's navigation is
never injected into posts — that is the price of keeping them byte-for-byte
untouched — so a post without its own back link is a dead end for readers.

`src/posts/how-posts-work/` is a working example.

## Configuration

Site details come from environment variables (see `src/_data/site.js`):

| Variable | Default |
|---|---|
| `SITE_TITLE` | `Blog` |
| `SITE_DESCRIPTION` | empty |
| `SITE_URL` | `https://blog.silencestar.com` |
| `SITE_AUTHOR` | empty |
| `SITE_LANG` | `zh-CN` |
| `PORT` | `5567` |

`SITE_URL` determines the absolute links in the RSS feed.

## Deployment

Cloudflare Pages, connected to this repository:

- Build command: `bun install --frozen-lockfile && bun run build`
- Output directory: `_site`
- Environment variable: `BUN_VERSION=1.3.14`
- Custom domain: `blog.silencestar.com`

The install step is spelled out on purpose: the Pages build image installs the
Bun runtime but does not install dependencies on its own for this project, so a
bare `bun run build` fails with `eleventy: command not found`.

`src/_headers` ships the cache policy. CSS and `pagefind-ui.js` have no content
hash in their filenames, so they deliberately use a short max-age instead of
`immutable` — otherwise a changed file keeps its URL and visitors are stuck with
a stale copy that cannot be invalidated.

Media currently ships with the site. If large videos or images arrive later,
move them to object storage (R2) with **content-hashed filenames** and rewrite
references at publish time; the site architecture does not need to change.

## License

[MIT](LICENSE)
