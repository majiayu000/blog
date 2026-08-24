function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} 只能是 true 或 false，收到 ${JSON.stringify(value)}`);
}

const siteUrl = process.env.SITE_URL ?? "https://blog.silencestar.com";

// 站点配置。部署环境可以覆盖默认值；启用评论后缺少任一 ID 会由增强器直接终止构建。
export default {
  title: process.env.SITE_TITLE ?? "Silent Star",
  description:
    process.env.SITE_DESCRIPTION ?? "关于 AI 工具、Agent 架构与工程实践的独立记录。",
  // RSS 里的绝对 URL 依赖它。默认给正式域名，忘了设环境变量也不会产出坏链接。
  url: siteUrl.replace(/\/+$/, ""),
  author: process.env.SITE_AUTHOR ?? "",
  language: process.env.SITE_LANG ?? "zh-CN",
  comments: {
    enabled: booleanEnv("GISCUS_ENABLED", true),
    repo: process.env.GISCUS_REPO ?? "majiayu000/blog",
    repoId: process.env.GISCUS_REPO_ID ?? "R_kgDOTm_R6Q",
    category: process.env.GISCUS_CATEGORY ?? "Announcements",
    categoryId: process.env.GISCUS_CATEGORY_ID ?? "DIC_kwDOTm_R6c4DEEKR",
  },
};
