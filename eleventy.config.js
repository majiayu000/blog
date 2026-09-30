import fs from "node:fs";
import path from "node:path";
import { enhanceBuiltPosts } from "./lib/enhance-posts.js";
import { generateOgImages } from "./lib/og-images.js";
import { readPosts } from "./lib/posts.js";
import site from "./src/_data/site.js";

export default function (eleventyConfig) {
  // 文章是已渲染好的整页 HTML —— 原样拷贝，绝不经过模板引擎。
  eleventyConfig.addPassthroughCopy("src/posts");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.ignores.add("src/posts/**");

  // 正式构建和 dev server 每次重建都走同一个增强步骤，避免本地预览与线上产物分叉。
  eleventyConfig.on("eleventy.after", () => {
    const postsDir = path.join(import.meta.dirname, "src", "posts");
    const outputDir = path.join(import.meta.dirname, "_site");
    const posts = readPosts(postsDir);
    const publishedSlugs = new Set(posts.map((post) => post.slug));
    // readPosts 已校验所有非隐藏文章目录；未入公开列表的目录就是草稿。
    // passthrough 会复制附件，必须在 Pagefind 运行前移除整个草稿目录。
    if (fs.existsSync(postsDir)) {
      for (const entry of fs.readdirSync(postsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith(".") && !publishedSlugs.has(entry.name.toLowerCase())) {
          fs.rmSync(path.join(outputDir, "posts", entry.name), { recursive: true, force: true });
        }
      }
    }
    enhanceBuiltPosts({
      posts,
      outputDir,
      site,
    });
    generateOgImages({
      posts,
      outputDir,
      site,
    });
  });

  // 点分数字而非"2026 年 7 月 29 日"：元数据用等宽字体排版，
  // 等宽字体拉开中文字距，纯数字才排得紧。
  eleventyConfig.addFilter("cnDate", (date) => date.replace(/-/g, "."));

  eleventyConfig.addFilter("rfc822", (date) => new Date(`${date}T00:00:00Z`).toUTCString());

  // 目录名保持原样（含中文），链接侧再 urlencode。
  // 若这里就 encode，产物目录名会字面带 %E4%B8..，服务器解码 URL 后反而匹配不上 → 404。
  eleventyConfig.addFilter("tagPath", (tag) => tag.toLowerCase().replace(/\s+/g, "-"));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
