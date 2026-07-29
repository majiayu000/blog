// 站点配置。可用环境变量覆盖，不 hardcode 到模板里。
export default {
  title: process.env.SITE_TITLE ?? "Blog",
  description: process.env.SITE_DESCRIPTION ?? "",
  // 部署到 Cloudflare Pages 后改成正式域名（RSS 里的绝对 URL 依赖它）
  url: process.env.SITE_URL ?? "http://localhost:5567",
  author: process.env.SITE_AUTHOR ?? "",
  language: process.env.SITE_LANG ?? "zh-CN",
};
