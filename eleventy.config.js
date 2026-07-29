export default function (eleventyConfig) {
  // 文章是已渲染好的整页 HTML —— 原样拷贝，绝不经过模板引擎。
  eleventyConfig.addPassthroughCopy("src/posts");
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy({ "src/_headers": "_headers" });
  eleventyConfig.ignores.add("src/posts/**");

  eleventyConfig.addFilter("cnDate", (date) => {
    const [y, m, d] = date.split("-");
    return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
  });

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
