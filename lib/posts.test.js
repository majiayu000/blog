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
  estimateReadingMinutes,
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
    // unquoted absolute URLs
    `<script src=https://evil.com/x.js></script>`,
    `<video src=https://evil.com/x.mp4></video>`,
    // protocol-relative URLs
    `<script src="//evil.com/x.js"></script>`,
    `<img src=//evil.com/x.png alt="">`,
    `<style>@import url("//evil.com/type.css");</style>`,
    // tags outside the old allow/deny list
    `<iframe src="https://evil.com"></iframe>`,
    `<embed src="https://evil.com/x.swf">`,
    `<object data=https://evil.com/x.pdf></object>`,
    `<base href="https://evil.com/">`,
    // srcset / imagesrcset / SVG <image> bypasses (SEC-07)
    `<img src="./a.png" srcset="https://evil.com/x.png">`,
    `<source srcset="https://evil.com/x.webp">`,
    `<link rel="preload" as="image" imagesrcset="https://evil.com/x.png">`,
    `<svg><image href="https://evil.com/x.png"></image></svg>`,
    `<svg><image xlink:href="https://evil.com/x.png"></image></svg>`,
    `<img src="./a.png" srcset="./a.png 1x, //evil.com/x.png 2x">`,
    // HTML character-reference bypasses (browsers decode before fetch)
    `<img srcset="https&colon;//evil.com/x.png 1x">`,
    `<img srcset="https&#x3a;//evil.com/x.png 1x">`,
    `<img src="https&colon;//evil.com/x.png">`,
    `<img src="https&#58;//evil.com/x.png">`,
    `<script src="https&colon;//evil.com/x.js"></script>`,
    // Whitespace entities / numeric refs inside the scheme (post-decode strip)
    `<img src="htt&tab;ps://evil.com/x.png">`,
    `<img src="htt&#9;ps://evil.com/x.png">`,
    `<img src="htt&#x09;ps://evil.com/x.png">`,
    `<img src="htt&#10;ps://evil.com/x.png">`,
    `<img src="htt&#13;ps://evil.com/x.png">`,
    `<img src="htt&newline;ps://evil.com/x.png">`,
    `<script src="htt&tab;ps://evil.com/x.js"></script>`,
    // Semicolonless numeric character references (HTML tokenizer)
    `<img srcset="https&#58//evil.com/x.png 1x">`,
    `<img src="https&#x3a//evil.com/x.png">`,
    // Backslash normalization in special-scheme / protocol-relative URLs
    `<img srcset="\\\\evil.com/x.png 1x">`,
    `<img src="/\\evil.com/x.png">`,
    `<img src="https:\\\\evil.com/x.png">`,
    // Slash between tag name and attributes
    `<img/srcset="https://evil.com/x.png">`,
    `<svg><image/href="https://evil.com/x.png"></image></svg>`,
    // Duplicate attrs: HTML keeps the first value
    `<img srcset="https://evil.com/x.png 1x" srcset="./local.png 1x">`,
    // SVG filter feImage loads external resources
    `<svg><feImage href="https://evil.com/x.png"></feImage></svg>`,
    // srcset: tokenize before stripping whitespace (tab must not glue candidates)
    `<img srcset="data:image/png;base64,AAAA\t1x,\thttps://evil.com/x.png\t2x">`,
    `<img srcset="data:image/png;base64,AAAA 1x,\thttps://evil.com/x.png 2x">`,
    // Standard &sol; named character reference (not only nonstandard &solidus;)
    `<img src="https:&sol;&sol;evil.com/x.png">`,
    `<img src="&sol;&sol;evil.com/x.png">`,
    `<img srcset="https:&sol;&sol;evil.com/x.png 1x">`,
    // Leading C0 controls stripped by URL parsing (beyond ASCII whitespace)
    `<img src="&#11;https://evil.com/x.png">`,
    `<img src="&#8;https://evil.com/x.png">`,
    `<img srcset="&#11;https://evil.com/x.png 1x">`,
    // Cross-scheme http without authority delimiter (browser → http://evil.com/…)
    `<img srcset="http:evil.com/x.png 1x">`,
    `<img src="http:evil.com/x.png">`,
    `<script src="http:evil.com/x.js"></script>`,
    // Full density grammar: scientific notation must not glue the next candidate
    `<img srcset="local.png 1e0x,https://evil.com/x.png 2x">`,
    `<img srcset="local.png 1E0x,https://evil.com/x.png 2x">`,
    `<img srcset="local.png .5x,https://evil.com/x.png 2x">`,
    // Quoted `>` must not truncate the open tag before srcset/src
    `<img alt=">" srcset="https://evil.com/x.png 1x">`,
    `<img title='a>b' src="https://evil.com/x.png">`,
    // Standard &bsol; → `\`; browsers resolve \\evil.com as protocol-relative
    `<img src="&bsol;&bsol;evil.com/x.png">`,
    `<img srcset="&bsol;&bsol;evil.com/x.png 1x">`,
    // Quotes inside unquoted attribute values are ordinary characters
    `<img alt=x' src="https://evil.com/a.png">`,
    `<img alt=x" src='https://evil.com/a.png'>`,
    // Height descriptor (`h`) must delimit candidates like `w` / `x`
    `<img srcset="local.png 100w 50h,https://evil.com/x.png 2x">`,
    `<img srcset="local.png 50h,https://evil.com/x.png 2x">`,
    // Probe hostname must not be treated as trusted / same-document
    `<img src="http:blog.invalid/x.png">`,
    `<img srcset="http:blog.invalid/x.png 1x">`,
    // Invalid descriptors must not rewind past the candidate comma
    `<img srcset="local.png 1e2w,https://evil.com/x.png 2x">`,
    `<img srcset="local.png bogus,https://evil.com/x.png 2x">`,
    `<img srcset="local.png 1xx,https://evil.com/x.png 2x">`,
    `<img srcset="local.png 100W,https://evil.com/x.png 2x">`,
    // SVG <use> can fetch external documents
    `<svg><use href="https://evil.com/icons.svg#icon"></use></svg>`,
    `<svg><use xlink:href="https://evil.com/icons.svg#icon"></use></svg>`,
    // Comments must be skipped whole so quotes inside cannot hide later tags
    `<!-- <fake a=" --> <img src=https://evil.com/a.png>`,
    // Unquoted values keep `=`; first-duplicate must not invent fake attrs
    `<img alt=x=src=local src=https://evil.com/a.png>`,
    // Trailing comma on a descriptorless candidate is a srcset boundary
    `<img srcset="local.png, https://evil.com/x.png 2x">`,
    `<img srcset="local.png,,, https://evil.com/x.png 2x">`,
    // RAWTEXT: unmatched quotes inside script/style must not hide later tags
    `<script>const x='<fake a="';</script><img src=https://evil.com/a.png>`,
    `<style>.x { content: '<fake a="'; }</style><img src=https://evil.com/a.png>`,
    // Abrupt HTML comment closes (`<!-->` / `<!--->`)
    `<!--> <img src=https://evil.com/a.png>`,
    `<!---> <img src=https://evil.com/a.png>`,
    // Only ASCII whitespace separates attributes (NBSP is part of the value)
    `<img alt=x\u00a0src=local src=https://evil.com/a.png>`,
    // Parse-error chars stay inside attribute names (do not invent earlier src)
    `<img foo"src=local src=https://evil.com/a.png>`,
    `<img foo'src=local src=https://evil.com/a.png>`,
    // Comment end-bang `--!>` closes like `-->`
    `<!-- foo --!><img src=https://evil.com/a.png>`,
    // RAWTEXT end-tag name requires a delimiter; `</scriptx>` must not close
    `<script></scriptx><fake a="</script><img src=https://evil.com/a.png>`,
    // Srcset: commas inside descriptor parentheses are not candidate boundaries
    `<img srcset="local.png bogus(foo,bar),https://evil.com/x.png 2x">`,
    // noscript body contents load for no-JS clients — scan them
    `<noscript><img src=https://evil.com/a.png></noscript>`,
    // Bogus comments / declarations end at first `>`; quotes inside must not hide later tags
    `<!foo <fake a="><img src=https://evil.com/a.png>`,
    `<!DOCTYPE html [<fake a=">]><img src=https://evil.com/a.png>`,
    `<?foo <fake a="><img src=https://evil.com/a.png>`,
    // RAWTEXT end tags: quoted `>` inside end-tag attrs is not the terminator
    `<script></script x="><fake a='"><img src=https://evil.com/a.png>`,
    `<style></style title="a>b"><img src=https://evil.com/a.png>`,
    // Srcset parentheses state is boolean, not nested — first `)` exits
    `<img srcset="local.png bogus((x),https://evil.com/x.png 2x">`,
    `<img srcset="local.png bogus(((y)),https://evil.com/x.png 2x">`,
    // Leading `=` in before-attribute-name is part of the attribute name
    `<img =src=local src=https://evil.com/a.png>`,
    // `<%` is not an HTML bogus comment; following tags still parse
    `<% <img src=https://evil.com/a.png>`,
    // Non-letter after `</` is a bogus comment ending at the first `>`
    `</! a="><img src=https://evil.com/a.png>`,
    // Self-closing foreignObject must not keep HTML-integration depth active
    `<svg><foreignObject/><use href="https://evil.com/icons.svg#x"></use></svg>`,
    // SVG <title> is an HTML integration point, not HTML RCDATA
    `<svg><title><img src="https://evil.com/a.png"></title></svg>`,
    // Nested <svg> inside foreignObject re-enters SVG context
    `<svg><foreignObject><svg><use href="https://evil.com/icons.svg#x"></use></svg></foreignObject></svg>`,
    // Leading `=` is attribute name, not a value delimiter (`="` must not quote to EOF)
    `<img =" ><img src=https://evil.com/a.png>`,
    // SVG CDATA lasts through `]]>`, not the first `>`
    `<svg><![CDATA[ > <fake a=" ]]><use href=https://evil.com/icons.svg#x></use></svg>`,
    // HTML raw-text ignores self-closing; `<script/>` still consumes until `</script>`
    `<script/><fake a="</script><img src=https://evil.com/a.png>`,
    // MathML CDATA lasts through `]]>`, not the first `>`
    `<math><![CDATA[ > <fake a=" ]]><img src=https://evil.com/a.png>`,
    // noscript RAWTEXT when scripting is enabled (also scanned as HTML when disabled)
    `<noscript><fake a="</noscript><img src=https://evil.com/a.png>`,
    // Script double-escaped state: first `</script>` does not close the element
    `<script><!--<script></script><fake a="</script><img src=https://evil.com/a.png>`,
    // HTML `<title>` inside SVG `<desc>` is RCDATA (integration-point child)
    `<svg><desc><title><fake a="</title></desc></svg><img src=https://evil.com/a.png>`,
    // Slash in an unquoted value is not the self-closing flag
    `<svg foo=x/><use href=https://evil.com/icons.svg#x></use></svg>`,
    // Mismatched `</svg>` ignored while a special HTML `div` is current
    `<svg><foreignObject><div></svg></div></foreignObject><use href=https://evil.com/icons.svg#x></use></svg>`,
    // MathML text integration points: HTML `<title>` is RCDATA under `<mtext>`
    `<math><mtext><title><fake a="</title></mtext></math><img src=https://evil.com/a.png>`,
    `<math><mi><title><fake a="</title></mi></math><img src=https://evil.com/a.png>`,
    // MathML annotation-xml with HTML encoding is an HTML integration point
    `<math><annotation-xml encoding="text/html"><title><fake a="</title></annotation-xml></math><img src=https://evil.com/a.png>`,
    // encoding compared after HTML character-reference decode
    `<math><annotation-xml encoding="text&sol;html"><title><fake a="</title></annotation-xml></math><img src=https://evil.com/a.png>`,
    `<math><annotation-xml encoding="text&#47;html"><title><fake a="</title></annotation-xml></math><img src=https://evil.com/a.png>`,
    // HTML void elements must not stay on the stack inside SVG foreignObject
    `<svg><foreignObject><br></foreignObject><title><img src=https://evil.com/a.png></title></svg>`,
    `<svg><foreignObject><img src=./local.png></foreignObject><title><img src=https://evil.com/a.png></title></svg>`,
    // <track src> loads remote subtitle/caption tracks
    `<video><track src=https://evil.com/captions.vtt></video>`,
    `<audio><track src="https://evil.com/captions.vtt" kind="captions"></audio>`,
    // Self-closing abandoned when `/` is followed by whitespace (`foo/ >`)
    `<svg foo/ ><use href="https://evil.com/icons.svg#x"></use></svg>`,
    // Foreign-content HTML breakout: `<p>` exits SVG so `<title>` is RCDATA
    `<svg><p><title><fake a="</title></p></svg><img src=https://evil.com/a.png>`,
    // Uppercase `&#X…;` hexadecimal character references
    `<img src="https&#X3A;//evil.com/x.png">`,
    `<img srcset="https&#X3A;//evil.com/x.png 1x">`,
    // MathML mglyph/malignmark stay MathML under text integration points
    `<math><mtext><mglyph><title><img src=https://evil.com/a.png></title></mglyph></mtext></math>`,
    `<math><mtext><malignmark><title><img src=https://evil.com/a.png></title></malignmark></mtext></math>`,
    // Special HTML `dialog` / `search` ignore mismatched foreign end tags
    `<svg><foreignObject><dialog></svg></dialog></foreignObject><use href=https://evil.com/icons.svg#x></use></svg>`,
    `<svg><foreignObject><search></svg></search></foreignObject><use href=https://evil.com/icons.svg#x></use></svg>`,
    // Solidus ends attribute name; `=` after `/` starts a new name (`foo/="`)
    `<svg foo/=" ><use href=https://evil.com/x.svg#x></use></svg>`,
    // DOCTYPE quoted public/system identifiers may contain `>`
    `<!DOCTYPE html SYSTEM '><fake a="'><img src=https://evil.com/a.png>`,
    `<!DOCTYPE html PUBLIC "a>b" "c><fake d='"><img src=https://evil.com/a.png>`,
    // Foreign-content breakout end tags `</p>` / `</br>`
    `<svg></p><title><fake a="</title></svg><img src=https://evil.com/x.png>`,
    `<svg></br><title><fake a="</title></svg><img src=https://evil.com/x.png>`,
  ];

  for (const dependency of dependencies) {
    expect(() => parsePost(page(`${metadata}${dependency}`), "s")).toThrow(/外部资源/);
  }
  expect(parsePost(page(metadata, `<a href="https://example.com/source">来源</a>`), "s").title).toBe("T");
  expect(
    parsePost(page(`${metadata}<img src="./cover.png" alt="">`, `<a href="//example.com/ok">协议相对来源</a>`), "s")
      .title,
  ).toBe("T");
  // production posts use relative srcset on <source> (e.g. glm52-k3-deepseekv4-training)
  expect(
    parsePost(
      page(metadata, `<picture><source srcset="cover.webp" type="image/webp"><img src="cover.png" alt=""></picture>`),
      "s",
    ).title,
  ).toBe("T");
  // data: srcset URLs may contain commas; must not false-positive on payload text
  expect(
    parsePost(
      page(
        `${metadata}<img srcset='data:image/png;base64,aaaa,https://evil.com/x.png 1x' alt="">`,
      ),
      "s",
    ).title,
  ).toBe("T");
  expect(
    parsePost(
      page(
        `${metadata}<img srcset='./local.png 1x, data:image/png;base64,aaaa,https://evil.com/x.png 2x' alt="">`,
      ),
      "s",
    ).title,
  ).toBe("T");
  // Non-data srcset URL tokens may contain commas; do not split mid-URL
  expect(
    parsePost(
      page(`${metadata}<img srcset="./img,https://evil.com/a.png 1x" alt="">`),
      "s",
    ).title,
  ).toBe("T");
  // Internal SPACE is not stripped (URL parser only strips at edges / removes tabs)
  expect(
    parsePost(page(`${metadata}<img src="/ /evil.com/a.png" alt="">`), "s").title,
  ).toBe("T");
  // Decoded `&amp;` is a query separator, not an unresolved named ref
  expect(
    parsePost(page(`${metadata}<img src="./cover.png?w=1&amp;h=2" alt="">`), "s").title,
  ).toBe("T");
  // &#0; → U+FFFD; browsers keep a same-origin relative URL (do not edge-trim FFFD)
  expect(
    parsePost(page(`${metadata}<img src="&#0;https://evil.com/x.png" alt="">`), "s").title,
  ).toBe("T");
  // Full tag name: non-ASCII continues the name (`imgé` is not `img`)
  expect(
    parsePost(page(`${metadata}<imgé src="https://evil.com/a.png">`), "s").title,
  ).toBe("T");
  // SVG-only tags in the HTML namespace do not fetch
  expect(
    parsePost(page(`${metadata}<use href="https://example.com/icons.svg#x"></use>`), "s").title,
  ).toBe("T");
  expect(
    parsePost(page(`${metadata}<feImage href="https://example.com/x.png"></feImage>`), "s").title,
  ).toBe("T");
  // Inside foreignObject (HTML integration point), SVG-only tags do not fetch
  expect(
    parsePost(
      page(
        `${metadata}<svg><foreignObject><use href="https://example.com/icons.svg#x"></use></foreignObject></svg>`,
      ),
      "s",
    ).title,
  ).toBe("T");
  // Form feed is not stripped from URL interiors (URL parser percent-encodes it)
  expect(
    parsePost(page(`${metadata}<img src="htt&#12;ps://evil.com/x.png" alt="">`), "s").title,
  ).toBe("T");
  // Srcset: tab is a candidate separator; do not glue into a remote URL first
  expect(
    parsePost(page(`${metadata}<img srcset="htt&#9;ps://evil.com/x.png 1x" alt="">`), "s").title,
  ).toBe("T");
  // Invalid srcset descriptor discards the candidate (no remote fetch)
  expect(
    parsePost(page(`${metadata}<img srcset="https://evil.com/x.png bogus" alt="">`), "s").title,
  ).toBe("T");
  // Duplicate / conflicting descriptors discard the candidate (browser behavior)
  expect(
    parsePost(page(`${metadata}<img srcset="https://evil.com/x.png 1x 2x" alt="">`), "s").title,
  ).toBe("T");
  expect(
    parsePost(page(`${metadata}<img srcset="https://evil.com/x.png 100w 200w" alt="">`), "s").title,
  ).toBe("T");
  expect(
    parsePost(page(`${metadata}<img srcset="https://evil.com/x.png 1x 100w" alt="">`), "s").title,
  ).toBe("T");
  // Zero width/height descriptors are invalid and discard the candidate
  expect(
    parsePost(page(`${metadata}<img srcset="https://evil.com/x.png 0w" alt="">`), "s").title,
  ).toBe("T");
  expect(
    parsePost(page(`${metadata}<img srcset="https://evil.com/x.png 0h" alt="">`), "s").title,
  ).toBe("T");
  // `<plaintext>` consumes through EOF; nested tag-like text does not fetch
  expect(
    parsePost(page(`${metadata}<plaintext><img src=https://evil.com/a.png>`), "s").title,
  ).toBe("T");
  // ASCII-only tag-name folding: Kelvin sign must not become `link`
  expect(
    parsePost(page(`${metadata}<lin\u212A href="https://evil.com/x.css">`), "s").title,
  ).toBe("T");
  // Named character references are case-sensitive (`&Colon;` ≠ `&colon;`)
  expect(
    parsePost(page(`${metadata}<img src="https&Colon;//evil.com/x.png" alt="">`), "s").title,
  ).toBe("T");
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
    old: `<title>旧</title><meta name="date" content="2025-01-01"><meta name="tags" content="Agent">`,
    fresh: `<title>新</title><meta name="date" content="2026-07-29"><meta name="tags" content="Agent">`,
    wip: `<title>草稿</title><meta name="date" content="2026-12-01"><meta name="draft" content="true">`,
  });
  expect(readPosts(root).map((p) => p.slug)).toEqual(["fresh", "old"]);
});

test("同日期的文章按 slug 稳定排序", () => {
  const root = fixture({
    beta: `<title>B</title><meta name="date" content="2026-01-01"><meta name="tags" content="Agent">`,
    alpha: `<title>A</title><meta name="date" content="2026-01-01"><meta name="tags" content="Agent">`,
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
    Hello: `<title>A</title><meta name="date" content="2026-01-01"><meta name="tags" content="Agent">`,
    hello: `<title>B</title><meta name="date" content="2026-01-02"><meta name="tags" content="Agent">`,
  });
  expect(() => readPosts(root)).toThrow(/重复/);
});

test("忽略隐藏目录", () => {
  const root = fixture({
    ".git": null,
    ok: `<title>T</title><meta name="date" content="2026-01-01"><meta name="tags" content="Agent">`,
  });
  expect(readPosts(root).map((p) => p.slug)).toEqual(["ok"]);
});

test("公开文章带阅读时间和主专题；无法归类时指出文件", () => {
  const root = fixture({
    hello: `<title>Hello</title><meta name="date" content="2026-01-02"><meta name="tags" content="Agent">`,
  });
  const [post] = readPosts(root);
  expect(post.readingMinutes).toBe(1);
  expect(post.topic.slug).toBe("agent-architecture");
  expect(estimateReadingMinutes(`<body>${"中".repeat(451)}</body>`)).toBe(2);

  const orphan = fixture({
    lost: `<title>Lost</title><meta name="date" content="2026-01-02"><meta name="tags" content="未知">`,
  });
  expect(() => readPosts(orphan)).toThrow(/posts\/lost\/index\.html.*无法归入/);
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

test("多篇 featured 时保留最新一篇并警告其余不上首页主推", () => {
  const posts = [
    { slug: "newest-pick", featured: true },
    { slug: "older-pick", featured: true },
    { slug: "other", featured: false },
  ];
  const warnings = [];
  const { featured, recent } = selectHomepagePosts(posts, (message) => warnings.push(message));

  expect(featured.slug).toBe("newest-pick");
  expect(recent.map((post) => post.slug)).toEqual(["older-pick", "other"]);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatch(/newest-pick/);
  expect(warnings[0]).toMatch(/older-pick/);
});
