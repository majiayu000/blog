import path from "node:path";
import {
  readPosts,
  groupByTag,
  groupByPrimaryTopic,
  groupByYear,
  selectHomepagePosts,
} from "../../lib/posts.js";

// 解析失败会在这里抛错 —— 构建直接失败，不产出带错误元数据的站点。
export default () => {
  const posts = readPosts(path.join(import.meta.dirname, "..", "posts"));
  const { featured, recent } = selectHomepagePosts(posts);

  return {
    posts,
    featured,
    recent,
    topics: groupByPrimaryTopic(posts),
    tags: groupByTag(posts),
    years: groupByYear(posts),
  };
};
