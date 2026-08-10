import fs from "node:fs";
import path from "node:path";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REMOTE_RESOURCE_TAG_RE = /<(?:link|script|img|video|audio|source)\b[^>]*(?:href|src)\s*=\s*["']https?:\/\//i;
const REMOTE_CSS_RESOURCE_RE = /(?:@import\s+(?:url\(\s*)?|url\(\s*)["']?https?:\/\//i;

/** 日历上真实存在吗。Date.parse 会把 2026-02-31 悄悄进位成 3 月 3 日，不能用。 */
function isRealDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 只在 <head> 范围内找元数据，避免正文里的示例代码被误读。 */
function headOf(html) {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : html;
}

function parseTitle(head) {
  const m = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : "";
}

/** 解析 <meta name=... content=...>，属性顺序任意。 */
function parseMetas(head) {
  const out = {};
  for (const tag of head.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = {};
    for (const a of tag[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attrs[a[1].toLowerCase()] = a[2];
    }
    if (attrs.name) out[attrs.name.toLowerCase()] = (attrs.content ?? "").trim();
  }
  return out;
}

function splitTags(raw) {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

/** 文章可以链接外部来源，但样式、脚本与媒体必须随文章目录一起搬得走。 */
function assertSelfContained(html, where) {
  if (REMOTE_RESOURCE_TAG_RE.test(html) || REMOTE_CSS_RESOURCE_RE.test(html)) {
    throw new Error(`${where}: 引用了外部资源；请删除它或下载到文章目录后使用相对路径`);
  }
}

/**
 * 从一篇文章的 HTML 解析元数据。
 * 缺必需字段或格式非法时抛错——绝不用文件名/当天日期兜底。
 */
export function parsePost(html, slug, where = slug) {
  const head = headOf(html);
  const title = parseTitle(head);
  const metas = parseMetas(head);

  if (!title) {
    throw new Error(`${where}: 缺少 <title>，无法确定文章标题`);
  }
  const date = metas.date;
  if (!date) {
    throw new Error(`${where}: 缺少 <meta name="date" content="YYYY-MM-DD">`);
  }
  if (!DATE_RE.test(date) || !isRealDate(date)) {
    throw new Error(`${where}: date "${date}" 不是合法的 YYYY-MM-DD`);
  }
  assertSelfContained(html, where);

  return {
    slug,
    url: `/posts/${slug}/`,
    title,
    date,
    description: metas.description ?? "",
    tags: splitTags(metas.tags),
    draft: metas.draft === "true",
    featured: metas.featured === "true",
  };
}

/**
 * 扫描文章根目录，返回按日期倒序的文章列表。
 * 目录不存在时返回空数组（还没写文章是合法状态，不是错误）。
 */
export function readPosts(postsDir) {
  if (!fs.existsSync(postsDir)) return [];

  const posts = [];
  const seen = new Map();

  for (const entry of fs.readdirSync(postsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const indexPath = path.join(postsDir, entry.name, "index.html");
    if (!fs.existsSync(indexPath)) {
      throw new Error(`posts/${entry.name}/ 下没有 index.html —— 一篇文章必须有入口页`);
    }

    const slug = entry.name.toLowerCase();
    if (seen.has(slug)) {
      throw new Error(`slug "${slug}" 重复：${seen.get(slug)} 与 ${entry.name} 会产生同一个 URL`);
    }
    seen.set(slug, entry.name);

    const post = parsePost(
      fs.readFileSync(indexPath, "utf8"),
      slug,
      `posts/${entry.name}/index.html`,
    );
    if (!post.draft) posts.push(post);
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

/** 标签 → 文章列表，标签按文章数倒序。 */
export function groupByTag(posts) {
  const map = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(post);
    }
  }
  return [...map.entries()]
    .map(([tag, items]) => ({ tag, posts: items }))
    .sort((a, b) => b.posts.length - a.posts.length || a.tag.localeCompare(b.tag));
}

/** 按年份分组，年份倒序。 */
export function groupByYear(posts) {
  const map = new Map();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(post);
  }
  return [...map.entries()]
    .map(([year, items]) => ({ year, posts: items }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

/** 首页只保留一个明确主推和最多四篇最新文章。 */
export function selectHomepagePosts(posts) {
  const featured = posts.find((post) => post.featured) ?? posts[0] ?? null;
  const recent = posts.filter((post) => post !== featured).slice(0, 4);
  return { featured, recent };
}
