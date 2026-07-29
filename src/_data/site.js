// 站点配置。可用环境变量覆盖，不 hardcode 到模板里。
export default {
  title: process.env.SITE_TITLE ?? "Silent Star",
  description:
    process.env.SITE_DESCRIPTION ?? "关于 AI 工具、Agent 架构与工程实践的独立记录。",
  // RSS 里的绝对 URL 依赖它。默认给正式域名，忘了设环境变量也不会产出坏链接。
  url: process.env.SITE_URL ?? "https://blog.silencestar.com",
  author: process.env.SITE_AUTHOR ?? "",
  language: process.env.SITE_LANG ?? "zh-CN",
};
