import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parsePost,
  readPosts,
  groupByTag,
  groupByPrimaryTopic,
  groupByYear,
  primaryTopicForPost,
  selectHomepagePosts,
} from "./posts.js";

const page = (head, body = "<p>正文</p>") =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test("解析完整的 head 元数据", () => {
  const post = parsePost(
    page(`
      <title>  标题带空白  </title>
      <meta name="date" content="2026-07-29">
      <meta name="description" content="一句话摘要">
      <meta name="tags" content="架构, 工具链 , 架构">
      <meta name="featured" content="true">
    `),
    "hello",
  );

  expect(post).toEqual({
    slug: "hello",
    url: "/posts/hello/",
    title: "标题带空白",
    date: "2026-07-29",
    updated: "",
    description: "一句话摘要",
    tags: ["架构", "工具链"], // 去重 + 去空白
    draft: false,
    featured: true,
  });
});

test("meta 属性顺序颠倒也能解析", () => {
  const post = parsePost(
    page(`<title>T</title><meta content="2026-01-02" name="date">`),
    "s",
  );
  expect(post.date).toBe("2026-01-02");
});

test("只读 head 内的元数据，正文里的同名标签不干扰", () => {
  const post = parsePost(
    page(
      `<title>真标题</title><meta name="date" content="2026-01-02">`,
      `<pre>&lt;title&gt;假标题&lt;/title&gt;</pre><meta name="date" content="1999-01-01">`,
    ),
    "s",
  );
  expect(post.title).toBe("真标题");
  expect(post.date).toBe("2026-01-02");
});

test("draft=true 会被标记", () => {
  const post = parsePost(
    page(`<title>T</title><meta name="date" content="2026-01-02"><meta name="draft" content="true">`),
    "s",
  );
  expect(post.draft).toBe(true);
});

test("可选字段缺失时给空值，不报错", () => {
  const post = parsePost(page(`<title>T</title><meta name="date" content="2026-01-02">`), "s");
  expect(post.description).toBe("");
  expect(post.tags).toEqual([]);
  expect(post.updated).toBe("");
  expect(post.featured).toBe(false);
});

test("updated 必须是真实日期且不能早于发布日期", () => {
  expect(() =>
    parsePost(
      page(`<title>T</title><meta name="date" content="2026-01-02"><meta name="updated" content="2026-02-31">`),
      "s",
    ),
  ).toThrow(/updated.*不是合法/);
  expect(() =>
    parsePost(
      page(`<title>T</title><meta name="date" content="2026-01-02"><meta name="updated" content="2025-12-31">`),
      "s",
    ),
  ).toThrow(/不能早于/);
});

test("外部资源依赖报错，但普通来源链接合法", () => {
  const metadata = `<title>T</title><meta name="date" content="2026-01-02">`;
  const dependencies = [
    `<link rel="stylesheet" href="https://example.com/site.css">`,
    `<style>@import url("https://example.com/type.css");</style>`,
    `<img src="https://example.com/cover.png" alt="">`,
  ];

  for (const dependency of dependencies) {
    expect(() => parsePost(page(`${metadata}${dependency}`), "s")).toThrow(/外部资源/);
  }
  expect(parsePost(page(metadata, `<a href="https://example.com/source">来源</a>`), "s").title).toBe("T");
});

// —— fail closed：以下每一条都必须抛错，不许兜底 ——

test("缺 title 报错，不用 slug 兜底", () => {
  expect(() => parsePost(page(`<meta name="date" content="2026-01-02">`), "hello")).toThrow(/缺少 <title>/);
});

test("缺 date 报错，不用当天日期兜底", () => {
  expect(() => parsePost(page(`<title>T</title>`), "hello")).toThrow(/缺少 <meta name="date"/);
});

test("date 格式非法报错", () => {
  expect(() =>
    parsePost(page(`<title>T</title><meta name="date" content="2026/01/02">`), "s"),
  ).toThrow(/不是合法的 YYYY-MM-DD/);
});

test("date 日历上不存在也报错", () => {
  expect(() =>
    parsePost(page(`<title>T</title><meta name="date" content="2026-02-31">`), "s"),
  ).toThrow(/不是合法的 YYYY-MM-DD/);
});

test("报错信息包含出错的文件位置", () => {
  expect(() => parsePost(page(``), "s", "posts/broken/index.html")).toThrow(
    /posts\/broken\/index\.html/,
  );
});

// —— 目录扫描 ——

function fixture(dirs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-posts-"));
  for (const [name, head] of Object.entries(dirs)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    if (head !== null) fs.writeFileSync(path.join(dir, "index.html"), page(head));
  }
  return root;
}

test("目录不存在返回空数组（还没写文章是合法状态）", () => {
  expect(readPosts(path.join(os.tmpdir(), "blog-posts-does-not-exist"))).toEqual([]);
});

test("按日期倒序返回，草稿被排除", () => {
  const root = fixture({
    old: `<title>旧</title><meta name="date" content="2025-01-01">`,
    fresh: `<title>新</title><meta name="date" content="2026-07-29">`,
    wip: `<title>草稿</title><meta name="date" content="2026-12-01"><meta name="draft" content="true">`,
  });
  expect(readPosts(root).map((p) => p.slug)).toEqual(["fresh", "old"]);
});

test("同日期的文章按 slug 稳定排序", () => {
  const root = fixture({
    beta: `<title>B</title><meta name="date" content="2026-01-01">`,
    alpha: `<title>A</title><meta name="date" content="2026-01-01">`,
  });
  expect(readPosts(root).map((p) => p.slug)).toEqual(["alpha", "beta"]);
});

test("文章目录缺 index.html 报错", () => {
  const root = fixture({ empty: null });
  expect(() => readPosts(root)).toThrow(/没有 index\.html/);
});

/** macOS 默认文件系统大小写不敏感，根本建不出两个只差大小写的目录。 */
function fsIsCaseSensitive() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-case-"));
  fs.mkdirSync(path.join(root, "A"));
  return !fs.existsSync(path.join(root, "a"));
}

test.skipIf(!fsIsCaseSensitive())("大小写不同但 URL 相同的 slug 报冲突", () => {
  const root = fixture({
    Hello: `<title>A</title><meta name="date" content="2026-01-01">`,
    hello: `<title>B</title><meta name="date" content="2026-01-02">`,
  });
  expect(() => readPosts(root)).toThrow(/重复/);
});

test("忽略隐藏目录", () => {
  const root = fixture({ ".git": null, ok: `<title>T</title><meta name="date" content="2026-01-01">` });
  expect(readPosts(root).map((p) => p.slug)).toEqual(["ok"]);
});

// —— 分组 ——

test("按标签分组，标签按文章数倒序", () => {
  const posts = [
    { slug: "a", tags: ["x", "y"], date: "2026-01-02" },
    { slug: "b", tags: ["x"], date: "2025-01-02" },
  ];
  expect(groupByTag(posts).map((g) => [g.tag, g.posts.length])).toEqual([
    ["x", 2],
    ["y", 1],
  ]);
});

test("主专题按编辑优先级为每篇文章唯一归类", () => {
  const posts = [
    { slug: "xray", tags: ["Grok Bot", "Agent"], date: "2026-01-03" },
    { slug: "bench", tags: ["Bun", "JavaScript"], date: "2026-01-02" },
    { slug: "history", tags: ["人物", "Google"], date: "2026-01-01" },
  ];
  expect(primaryTopicForPost(posts[0]).slug).toBe("product-xray");
  expect(groupByPrimaryTopic(posts).map((topic) => [topic.slug, topic.posts.length])).toEqual([
    ["product-xray", 1],
    ["benchmarks-runtime", 1],
    ["people-history", 1],
  ]);
  expect(() => primaryTopicForPost({ slug: "orphan", tags: ["未知"] })).toThrow(/无法归入/);
});

test("按年分组，年份倒序", () => {
  const posts = [
    { slug: "a", tags: [], date: "2026-01-02" },
    { slug: "b", tags: [], date: "2025-01-02" },
    { slug: "c", tags: [], date: "2026-03-04" },
  ];
  expect(groupByYear(posts).map((g) => [g.year, g.posts.length])).toEqual([
    ["2026", 2],
    ["2025", 1],
  ]);
});

// —— 首页策展 ——

test("首页优先显式精选，并只保留四篇其他新文章", () => {
  const posts = [
    { slug: "newest", featured: false },
    { slug: "pick", featured: true },
    { slug: "three", featured: false },
    { slug: "four", featured: false },
    { slug: "five", featured: false },
    { slug: "six", featured: false },
  ];
  const { featured, recent } = selectHomepagePosts(posts);

  expect(featured.slug).toBe("pick");
  expect(recent.map((post) => post.slug)).toEqual(["newest", "three", "four", "five"]);
});

test("首页无精选时回退最新文章，空列表保持合法", () => {
  const posts = [{ slug: "newest", featured: false }, { slug: "old", featured: false }];
  expect(selectHomepagePosts(posts)).toEqual({ featured: posts[0], recent: [posts[1]] });
  expect(selectHomepagePosts([])).toEqual({ featured: null, recent: [] });
});
