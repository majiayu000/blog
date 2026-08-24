import { expect, test } from "bun:test";
import {
  enhancePostHtml,
  estimateReadingMinutes,
  extractToc,
  getPostJourney,
} from "./enhance-posts.js";

const posts = [
  {
    slug: "new",
    url: "/posts/new/",
    title: "新文章",
    date: "2026-08-24",
    description: "新文章摘要",
    tags: ["Agent", "工具链"],
  },
  {
    slug: "current",
    url: "/posts/current/",
    title: "当前文章",
    date: "2026-08-20",
    description: "当前文章摘要",
    tags: ["Agent", "架构"],
  },
  {
    slug: "related",
    url: "/posts/related/",
    title: "相关文章",
    date: "2026-08-18",
    description: "相关文章摘要",
    tags: ["Agent"],
  },
  {
    slug: "old",
    url: "/posts/old/",
    title: "旧文章",
    date: "2026-08-01",
    description: "旧文章摘要",
    tags: ["人物"],
  },
];

const site = {
  title: "Silent Star",
  description: "站点摘要",
  url: "https://blog.silencestar.com",
  author: "",
  language: "zh-CN",
  comments: {
    enabled: false,
    repo: "majiayu000/blog",
    repoId: "R_repo",
    category: "",
    categoryId: "",
  },
};

const html = `<!doctype html>
<html><head><title>当前文章</title></head><body><main><h2 id="first">第一节</h2><p>正文不可改</p><h2 id="second"><span>第二节</span></h2></main></body></html>`;

test("文章旅程按时间给出前后文章；同专题只剩前后篇时回填继续阅读", () => {
  const journey = getPostJourney(posts, posts[1]);
  expect(journey.newer.slug).toBe("new");
  expect(journey.older.slug).toBe("related");
  expect(journey.related.map((post) => post.slug)).toEqual(["new", "related"]);
});

test("继续阅读只保留同专题或标签交集大于 0 的文章", () => {
  const catalog = [
    { slug: "newer", url: "/posts/newer/", title: "n", date: "2026-08-24", tags: ["人物"] },
    { slug: "current", url: "/posts/current/", title: "c", date: "2026-08-20", tags: ["Claude Code"] },
    { slug: "older", url: "/posts/older/", title: "o", date: "2026-08-18", tags: ["Bun"] },
    { slug: "shared-tag", url: "/posts/shared-tag/", title: "t", date: "2026-08-09", tags: ["Claude Code", "Codex"] },
    { slug: "same-topic", url: "/posts/same-topic/", title: "s", date: "2026-08-10", tags: ["Codex"] },
    { slug: "unrelated", url: "/posts/unrelated/", title: "u", date: "2026-08-01", tags: ["人物"] },
  ];
  const journey = getPostJourney(catalog, catalog[1]);
  expect(journey.newer.slug).toBe("newer");
  expect(journey.older.slug).toBe("older");
  expect(journey.related.map((post) => post.slug)).toEqual(["shared-tag", "same-topic"]);
});

test("专题只有一篇且无标签交集时输出继续阅读空状态", () => {
  const lonely = [
    {
      slug: "current",
      url: "/posts/current/",
      title: "当前文章",
      date: "2026-08-20",
      tags: ["Agent"],
    },
  ];
  const enhanced = enhancePostHtml(html, lonely[0], lonely, site);
  expect(enhanced).toContain(`本专题暂无更多文章`);
  expect(enhanced).toContain(`/topics/agent-architecture/`);
  expect(enhanced).toContain(`查看「Agent 架构」`);
});

test("增强器追加 SEO、阅读工具和 afterword，不改正文", () => {
  const enhanced = enhancePostHtml(html, posts[1], posts, site);

  expect(enhanced).toContain(`<link rel="canonical" href="https://blog.silencestar.com/posts/current/">`);
  expect(enhanced).toContain(`<meta property="og:type" content="article">`);
  expect(enhanced).toContain(`<meta property="og:image" content="https://blog.silencestar.com/og/current.png">`);
  expect(enhanced).toContain(`<meta name="twitter:card" content="summary_large_image">`);
  expect(enhanced).toContain(`data-pagefind-meta="topic[content]"`);
  expect(enhanced).toContain(`<script type="application/ld+json">`);
  expect(enhanced).toContain(`<link rel="stylesheet" href="/css/post-enhancement.css">`);
  expect(enhanced).toContain(`document.documentElement.dataset.ssShellTheme = savedTheme`);
  expect(enhanced).toContain(`<script src="/js/search-shortcut.js" defer></script>`);
  expect(enhanced).not.toContain(`window.__SS_ANALYTICS__`);
  expect(enhanced).toContain(`<p>正文不可改</p>`);
  expect(enhanced).toContain(`class="ss-afterword"`);
  expect(enhanced).toContain(`class="ss-article-rail"`);
  expect(enhanced).toContain(`href="#first"`);
  expect(enhanced).toContain(`约 1 分钟`);
  expect(enhanced).toContain(`更新一篇`);
  expect(enhanced).toContain(`更早一篇`);
  expect(enhanced).toContain(`评论连接已在代码中准备好`);
  expect(enhanced).not.toContain(`https://giscus.app/client.js`);
});

test("评论启用时必须配置完整，配置完整时只生成延迟加载配置", () => {
  const incomplete = {
    ...site,
    comments: { ...site.comments, enabled: true },
  };
  expect(() => enhancePostHtml(html, posts[1], posts, incomplete)).toThrow(
    /缺少 comments\.category/,
  );

  const configured = {
    ...site,
    comments: {
      ...site.comments,
      enabled: true,
      category: "Comments",
      categoryId: "DIC_category",
    },
  };
  const enhanced = enhancePostHtml(html, posts[1], posts, configured);
  expect(enhanced).not.toContain(`https://giscus.app/client.js`);
  expect(enhanced).toContain(`data-giscus-repo="majiayu000/blog"`);
  expect(enhanced).toContain(`data-giscus-category-id="DIC_category"`);
  expect(enhanced).toContain(`评论将在接近页面底部时加载`);
});

test("目录保留安全唯一 id，并为其余二级标题生成稳定锚点", () => {
  const article = `<body><h2 id="ok">可用 <em>标题</em></h2><h2>无 id</h2><h2 id="ok">重复</h2><h2 id="bad id">非法</h2></body>`;
  expect(extractToc(article)).toEqual([
    { id: "ok", title: "可用 标题" },
    { id: "ss-section-02", title: "无 id" },
    { id: "ss-section-03", title: "重复" },
    { id: "ss-section-04", title: "非法" },
  ]);
  expect(estimateReadingMinutes("<body><p>短文</p></body>")).toBe(1);
});

test("缺失闭合标签或重复增强时 fail closed", () => {
  expect(() => enhancePostHtml(html.replace("</body>", ""), posts[1], posts, site)).toThrow(
    /恰好有一个 <\/body>/,
  );

  const enhanced = enhancePostHtml(html, posts[1], posts, site);
  expect(() => enhancePostHtml(enhanced, posts[1], posts, site)).toThrow(/重复的文章增强标记/);
});

test("分析启用时必须有合法 endpoint，配置完整时才注入脚本", () => {
  expect(() =>
    enhancePostHtml(html, posts[1], posts, {
      ...site,
      analytics: { enabled: true, endpoint: "" },
    }),
  ).toThrow(/缺少 analytics\.endpoint/);

  expect(() =>
    enhancePostHtml(html, posts[1], posts, {
      ...site,
      analytics: { enabled: true, endpoint: "javascript:alert(1)" },
    }),
  ).toThrow(/只允许 http\/https 或同源路径/);

  const enhanced = enhancePostHtml(html, posts[1], posts, {
    ...site,
    analytics: { enabled: true, endpoint: "/api/event" },
    cloudflareWebAnalytics: { token: "cf_token_example" },
  });
  expect(enhanced).toContain(`window.__SS_ANALYTICS__={"endpoint":"/api/event","pageType":"post"}`);
  expect(enhanced).toContain(`<script src="/js/analytics.js" defer></script>`);
  expect(enhanced).toContain(`data-cf-beacon='{"token":"cf_token_example"}'`);
  expect(enhanced).toContain(`data-ss-event="journey_click"`);

  expect(() =>
    enhancePostHtml(html, posts[1], posts, {
      ...site,
      cloudflareWebAnalytics: { token: "not a token" },
    }),
  ).toThrow(/token/);
});

test("结构化数据和属性转义不允许标题闭合 script", () => {
  const hostile = {
    ...posts[1],
    title: `标题</script><script>alert("x")</script>`,
  };
  const hostilePosts = posts.map((post) => (post.slug === hostile.slug ? hostile : post));
  const enhanced = enhancePostHtml(html, hostile, hostilePosts, site);

  expect(enhanced).not.toContain(`</script><script>alert`);
  expect(enhanced).toContain(`标题&lt;/script&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;`);
  expect(enhanced).toContain(`标题\\u003c/script>\\u003cscript>alert`);
});
