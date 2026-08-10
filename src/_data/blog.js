import path from "node:path";
import { readPosts, groupByTag, groupByYear } from "../../lib/posts.js";

// 解析失败会在这里抛错 —— 构建直接失败，不产出带错误元数据的站点。
export default () => {
  const posts = readPosts(path.join(import.meta.dirname, "..", "posts"));
  const featured = posts.find((post) => post.featured) ?? posts[0] ?? null;
  const recent = posts.filter((post) => post !== featured).slice(0, 4);

  return {
    posts,
    featured,
    recent,
    tags: groupByTag(posts),
    years: groupByYear(posts),
  };
};
