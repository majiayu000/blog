import fs from "node:fs";
import path from "node:path";
import { estimateReadingMinutes, primaryTopicForPost, stripHtml } from "./posts.js";

export { estimateReadingMinutes } from "./posts.js";

const HEAD_MARKER = "silent-star:head";
const AFTERWORD_MARKER = "silent-star:afterword";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function absoluteUrl(siteUrl, pathname) {
  return new URL(pathname, `${siteUrl}/`).href;
}

function assertSiteConfig(site) {
  if (!site || typeof site !== "object") throw new Error("站点配置缺失");
  if (!site.title?.trim()) throw new Error("站点配置缺少 title");
  if (!site.url?.trim()) throw new Error("站点配置缺少 url");

  let parsed;
  try {
    parsed = new URL(site.url);
  } catch {
    throw new Error(`站点 url ${JSON.stringify(site.url)} 不是合法 URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`站点 url 只允许 http/https，收到 ${parsed.protocol}`);
  }
  if (site.authorUrl) {
    let authorUrl;
    try {
      authorUrl = new URL(site.authorUrl);
    } catch {
      throw new Error(`站点 authorUrl ${JSON.stringify(site.authorUrl)} 不是合法 URL`);
    }
    if (!['http:', 'https:'].includes(authorUrl.protocol)) {
      throw new Error(`站点 authorUrl 只允许 http/https，收到 ${authorUrl.protocol}`);
    }
  }
}

function assertCommentsConfig(comments) {
  if (!comments?.enabled) return;

  for (const key of ["repo", "repoId", "category", "categoryId"]) {
    if (!comments[key]?.trim()) {
      throw new Error(`评论已启用，但缺少 comments.${key}`);
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(comments.repo)) {
    throw new Error(`comments.repo ${JSON.stringify(comments.repo)} 不是 owner/repo`);
  }
}

function assertAnalyticsConfig(analytics) {
  if (!analytics?.enabled) return;

  const endpoint = analytics.endpoint?.trim();
  if (!endpoint) {
    throw new Error("分析已启用，但缺少 analytics.endpoint");
  }
  if (endpoint.startsWith("/")) {
    if (endpoint.startsWith("//") || endpoint.includes("\\") || /[<>"']/.test(endpoint)) {
      throw new Error(`analytics.endpoint ${JSON.stringify(endpoint)} 不是合法的同源路径`);
    }
    return;
  }

  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`analytics.endpoint ${JSON.stringify(endpoint)} 不是合法 URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`analytics.endpoint 只允许 http/https 或同源路径，收到 ${parsed.protocol}`);
  }
}

function assertCloudflareWebAnalytics(cloudflareWebAnalytics) {
  const token = cloudflareWebAnalytics?.token?.trim();
  if (!token) return;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("CF Web Analytics token 只能包含字母、数字、下划线和连字符");
  }
}

function scoreRelatedPosts(posts, current, excludedSlugs, limit = 3) {
  const currentTags = new Set(current.tags);
  const currentTopic = primaryTopicForPost(current).slug;
  return posts
    .filter((post) => post.slug !== current.slug && !excludedSlugs.has(post.slug))
    .map((post) => {
      const tagScore = post.tags.reduce((total, tag) => total + Number(currentTags.has(tag)), 0);
      const sameTopic = primaryTopicForPost(post).slug === currentTopic;
      return { post, tagScore, sameTopic };
    })
    .filter(({ tagScore, sameTopic }) => tagScore > 0 || sameTopic)
    .sort(
      (a, b) =>
        b.tagScore - a.tagScore ||
        Number(b.sameTopic) - Number(a.sameTopic) ||
        b.post.date.localeCompare(a.post.date) ||
        a.post.slug.localeCompare(b.post.slug),
    )
    .slice(0, limit)
    .map(({ post }) => post);
}

export function getPostJourney(posts, current, relatedLimit = 3) {
  const index = posts.findIndex((post) => post.slug === current.slug);
  if (index === -1) throw new Error(`文章 ${current.slug} 不在文章列表中`);

  const newer = index > 0 ? posts[index - 1] : null;
  const older = index < posts.length - 1 ? posts[index + 1] : null;
  const journeySlugs = new Set([newer?.slug, older?.slug].filter(Boolean));

  return {
    newer,
    older,
    related: scoreRelatedPosts(posts, current, journeySlugs, relatedLimit),
  };
}

function renderSeoHead(post, site) {
  const canonical = absoluteUrl(site.url, post.url);
  const image = absoluteUrl(site.url, `/og/${post.slug}.png`);
  const description = post.description || site.description || post.title;
  const author = site.author || site.title;
  const topic = primaryTopicForPost(post);
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    image,
    mainEntityOfPage: canonical,
    url: canonical,
    author: { "@type": "Person", name: author },
    publisher: { "@type": "Organization", name: site.title, url: site.url },
    keywords: post.tags,
    inLanguage: site.language,
  }).replaceAll("<", "\\u003c");

  const tags = post.tags
    .map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`)
    .join("\n");

  return `<!-- ${HEAD_MARKER}:start -->
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtml(site.title)}">
<meta property="og:title" content="${escapeHtml(post.title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="article:published_time" content="${escapeHtml(post.date)}">
${post.updated ? `<meta property="article:modified_time" content="${escapeHtml(post.updated)}">` : ""}
${tags}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(post.title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta data-pagefind-meta="title[content]" content="${escapeHtml(post.title)}">
<meta data-pagefind-meta="date[content]" content="${escapeHtml((post.updated || post.date).replaceAll("-", "."))}">
<meta data-pagefind-meta="topic[content]" content="${escapeHtml(topic.title)}">
<meta data-pagefind-meta="tags[content]" content="${escapeHtml(post.tags.join(", "))}">
<script type="application/ld+json">${structuredData}</script>
<link rel="stylesheet" href="/css/post-enhancement.css">
<script src="/js/search-shortcut.js" defer></script>
<script src="/js/post-enhancement.js" defer></script>
${renderAnalyticsHead(site, "post")}
<!-- ${HEAD_MARKER}:end -->`;
}

function renderAnalyticsHead(site, pageType) {
  const parts = [];
  const token = site.cloudflareWebAnalytics?.token?.trim();
  if (token) {
    const beacon = JSON.stringify({ token }).replaceAll("<", "\\u003c");
    parts.push(
      `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${beacon}'></script>`,
    );
  }
  if (!site.analytics?.enabled) return parts.join("\n");

  const config = JSON.stringify({
    endpoint: site.analytics.endpoint,
    pageType,
  }).replaceAll("<", "\\u003c");
  parts.push(`<script>window.__SS_ANALYTICS__=${config};</script>`);
  parts.push(`<script src="/js/analytics.js" defer></script>`);
  return parts.join("\n");
}

function renderJourneyLink(post, label, direction) {
  if (!post) {
    return `<span class="ss-afterword__journey-empty" aria-hidden="true"></span>`;
  }
  return `<a class="ss-afterword__journey-link ss-afterword__journey-link--${direction}" href="${escapeHtml(post.url)}" data-ss-event="journey_click" data-ss-direction="${escapeHtml(direction)}" data-ss-slug="${escapeHtml(post.slug)}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(post.title)}</strong>
  </a>`;
}

function renderRelatedPosts(related) {
  if (!related.length) return "";

  const items = related
    .map((post, index) => {
      const topic = primaryTopicForPost(post).title;
      return `<li>
        <a href="${escapeHtml(post.url)}" data-ss-event="related_click" data-ss-slug="${escapeHtml(post.slug)}">
          <span class="ss-afterword__related-index">0${index + 1}</span>
          <span class="ss-afterword__related-copy">
            <small>${escapeHtml(topic)}</small>
            <strong>${escapeHtml(post.title)}</strong>
          </span>
          <span class="ss-afterword__related-arrow" aria-hidden="true">↗</span>
        </a>
      </li>`;
    })
    .join("\n");

  return `<section class="ss-afterword__related" aria-labelledby="ss-related-heading">
    <div class="ss-afterword__section-heading">
      <span>// KEEP READING</span>
      <h3 id="ss-related-heading">继续阅读</h3>
    </div>
    <ol>${items}</ol>
  </section>`;
}

function renderComments(post, comments) {
  const discussionUrl = comments?.repo
    ? `https://github.com/${comments.repo}/discussions`
    : "https://github.com";

  if (!comments?.enabled) {
    return `<section class="ss-afterword__comments ss-afterword__comments--pending" aria-labelledby="ss-comments-heading">
      <div class="ss-afterword__section-heading">
        <span>// DISCUSSION</span>
        <h3 id="ss-comments-heading">评论</h3>
      </div>
      <p>评论连接已在代码中准备好，完成 GitHub Discussions 配置后开放。</p>
    </section>`;
  }

  return `<section class="ss-afterword__comments" aria-labelledby="ss-comments-heading">
    <div class="ss-afterword__section-heading">
      <span>// DISCUSSION</span>
      <h3 id="ss-comments-heading">评论</h3>
    </div>
    <p class="ss-afterword__comments-intro">用 GitHub 账号参与讨论。评论公开保存在 Discussions，可随时编辑。</p>
    <div class="giscus"
      data-giscus-repo="${escapeHtml(comments.repo)}"
      data-giscus-repo-id="${escapeHtml(comments.repoId)}"
      data-giscus-category="${escapeHtml(comments.category)}"
      data-giscus-category-id="${escapeHtml(comments.categoryId)}"></div>
    <p class="ss-afterword__comments-status" data-giscus-status>评论将在接近页面底部时加载。</p>
    <p class="ss-afterword__comments-fallback">如果评论组件没有加载，请前往
      <a href="${escapeHtml(discussionUrl)}" target="_blank" rel="noopener noreferrer">GitHub Discussions</a>。
    </p>
  </section>`;
}

export function extractToc(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const seen = new Set();
  const headings = [];
  let index = 0;
  for (const match of body.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)) {
    index += 1;
    const authoredId = match[1].match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    const title = stripHtml(match[2]);
    let id = authoredId;
    if (!id || !/^[A-Za-z][\w:.-]*$/.test(id) || seen.has(id)) {
      id = `ss-section-${String(index).padStart(2, "0")}`;
      while (seen.has(id)) id = `${id}-generated`;
    }
    if (!title) continue;
    seen.add(id);
    headings.push({ id, title });
  }
  return headings;
}

function renderTocLinks(headings) {
  return headings
    .map(
      (heading, index) => `<li><a href="#${escapeHtml(heading.id)}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(heading.title)}</a></li>`,
    )
    .join("\n");
}

function renderArticleTools(html, post, site) {
  const headings = extractToc(html);
  const minutes = estimateReadingMinutes(html);
  const date = post.updated || post.date;
  const dateLabel = post.updated ? "更新" : "发布";
  const author = site.author || site.title;
  const authorMarkup = site.authorUrl
    ? `<a href="${escapeHtml(site.authorUrl)}" target="_blank" rel="me noopener noreferrer">${escapeHtml(author)}</a>`
    : `<span>${escapeHtml(author)}</span>`;
  const links = renderTocLinks(headings);
  const meta = `<div class="ss-article-tools__meta">${authorMarkup}<span>约 ${minutes} 分钟</span><time datetime="${escapeHtml(date)}">${dateLabel} ${escapeHtml(date.replaceAll("-", "."))}</time></div>`;
  const navigation = headings.length
    ? `<nav aria-label="文章目录"><ol>${links}</ol></nav>`
    : `<p class="ss-article-tools__empty">这篇文章没有可用的章节锚点。</p>`;

  return `<aside class="ss-article-rail" aria-label="文章信息与目录" data-pagefind-ignore>
    <p class="ss-article-tools__eyebrow">// ON THIS PAGE</p>
    ${meta}
    ${navigation}
  </aside>
  <details class="ss-article-drawer" data-pagefind-ignore>
    <summary><span>${headings.length ? "文章目录" : "文章信息"}</span><b>${headings.length || "i"}</b></summary>
    <div class="ss-article-drawer__body">${meta}${navigation}</div>
  </details>`;
}

function renderAfterword(html, post, journey, site) {
  const topicLinks = post.tags
    .map(
      (tag) =>
        `<a href="/tags/${encodeURIComponent(tag.toLowerCase().replace(/\s+/g, "-"))}/">#${escapeHtml(tag)}</a>`,
    )
    .join("");

  return `<!-- ${AFTERWORD_MARKER}:start -->
${renderArticleTools(html, post, site)}
<aside class="ss-afterword" id="afterword" aria-label="文章后记与评论" data-pagefind-ignore>
  <div class="ss-afterword__topline">
    <a class="ss-afterword__brand" href="/">SILENT STAR <span>/LOG</span></a>
    <span class="ss-afterword__edition">AFTERWORD · ${escapeHtml(post.date.replaceAll("-", "."))}</span>
  </div>

  <div class="ss-afterword__lead">
    <div>
      <p>// END OF NOTE</p>
      <h2>读到这里，<br>不妨再往前一步。</h2>
    </div>
    <div class="ss-afterword__actions">
      <button type="button" data-copy-page>复制链接</button>
      <a href="/archive/">全部文章</a>
      <a href="/feed.xml">订阅 RSS</a>
    </div>
  </div>

  ${topicLinks ? `<nav class="ss-afterword__tags" aria-label="文章主题">${topicLinks}</nav>` : ""}

  <nav class="ss-afterword__journey" aria-label="前后文章">
    ${renderJourneyLink(journey.newer, "更新一篇", "newer")}
    ${renderJourneyLink(journey.older, "更早一篇", "older")}
  </nav>

  ${renderRelatedPosts(journey.related)}
  ${renderComments(post, site.comments)}
</aside>
<!-- ${AFTERWORD_MARKER}:end -->`;
}

function assertSingleClosingTag(html, tag, where) {
  const matches = html.match(new RegExp(`</${tag}\\s*>`, "gi")) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${where}: 必须恰好有一个 </${tag}>，实际 ${matches.length} 个`);
  }
}

export function enhancePostHtml(html, post, posts, site, where = post.slug) {
  assertSiteConfig(site);
  assertCommentsConfig(site.comments);
  assertAnalyticsConfig(site.analytics);
  assertCloudflareWebAnalytics(site.cloudflareWebAnalytics);
  if (html.includes(HEAD_MARKER) || html.includes(AFTERWORD_MARKER)) {
    throw new Error(`${where}: 检测到重复的文章增强标记`);
  }
  assertSingleClosingTag(html, "head", where);
  assertSingleClosingTag(html, "body", where);

  const journey = getPostJourney(posts, post);
  const withHead = html.replace(/<\/head\s*>/i, `${renderSeoHead(post, site)}\n</head>`);
  return withHead.replace(
    /<\/body\s*>/i,
    `${renderAfterword(html, post, journey, site)}\n</body>`,
  );
}

export function enhanceBuiltPosts({ posts, outputDir, site }) {
  assertSiteConfig(site);
  assertCommentsConfig(site.comments);
  assertAnalyticsConfig(site.analytics);
  assertCloudflareWebAnalytics(site.cloudflareWebAnalytics);

  for (const post of posts) {
    const outputPath = path.join(outputDir, "posts", post.slug, "index.html");
    if (!fs.existsSync(outputPath)) {
      throw new Error(`构建产物缺少 ${outputPath}`);
    }
    const html = fs.readFileSync(outputPath, "utf8");
    const enhanced = enhancePostHtml(html, post, posts, site, outputPath);
    fs.writeFileSync(outputPath, enhanced);
  }
}
