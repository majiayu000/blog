function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} 只能是 true 或 false，收到 ${JSON.stringify(value)}`);
}

const siteUrl = process.env.SITE_URL ?? "https://blog.silencestar.com";

const analytics = {
  enabled: booleanEnv("ANALYTICS_ENABLED", true),
  endpoint: (process.env.ANALYTICS_ENDPOINT ?? "/api/event").trim(),
};
if (analytics.enabled && !analytics.endpoint) {
  throw new Error("ANALYTICS_ENABLED=true 但 ANALYTICS_ENDPOINT 为空");
}

const cloudflareWebAnalytics = {
  token: (process.env.CF_WEB_ANALYTICS_TOKEN ?? "").trim(),
};
if (cloudflareWebAnalytics.token && !/^[A-Za-z0-9_-]+$/.test(cloudflareWebAnalytics.token)) {
  throw new Error("CF_WEB_ANALYTICS_TOKEN 只能包含字母、数字、下划线和连字符");
}

const site = {
  title: process.env.SITE_TITLE ?? "Silent Star",
  description:
    process.env.SITE_DESCRIPTION ?? "关于 AI 工具、Agent 架构与工程实践的独立记录。",
  // RSS 里的绝对 URL 依赖它。默认给正式域名，忘了设环境变量也不会产出坏链接。
  url: siteUrl.replace(/\/+$/, ""),
  author: process.env.SITE_AUTHOR ?? "",
  authorUrl: process.env.SITE_AUTHOR_URL ?? "https://github.com/majiayu000",
  language: process.env.SITE_LANG ?? "zh-CN",
  comments: {
    enabled: booleanEnv("GISCUS_ENABLED", true),
    repo: process.env.GISCUS_REPO ?? "majiayu000/blog",
    repoId: process.env.GISCUS_REPO_ID ?? "R_kgDOTm_R6Q",
    category: process.env.GISCUS_CATEGORY ?? "Announcements",
    categoryId: process.env.GISCUS_CATEGORY_ID ?? "DIC_kwDOTm_R6c4DEEKR",
  },
  analytics,
  cloudflareWebAnalytics,
};

site.websiteJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.title,
  url: site.url,
  description: site.description,
  inLanguage: site.language,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${site.url}/search/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
}).replaceAll("<", "\\u003c");

// 站点配置。部署环境可以覆盖默认值；启用评论或分析后缺少必要配置会直接终止构建。
export default site;
