export default function (eleventyConfig) {
  // 文章是已渲染好的整页 HTML —— 原样拷贝，绝不经过模板引擎。
  eleventyConfig.addPassthroughCopy("src/posts");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.ignores.add("src/posts/**");

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
