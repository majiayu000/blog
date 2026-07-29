import path from "node:path";
import { readPosts, groupByTag, groupByYear } from "../../lib/posts.js";

// 解析失败会在这里抛错 —— 构建直接失败，不产出带错误元数据的站点。
export default () => {
  const posts = readPosts(path.join(import.meta.dirname, "..", "posts"));
  return { posts, tags: groupByTag(posts), years: groupByYear(posts) };
};
