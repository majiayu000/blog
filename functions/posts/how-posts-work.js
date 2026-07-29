const gone_page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>内容已删除 · Silent Star</title>
</head>
<body>
<main>
  <h1>内容已删除</h1>
  <p>这个示例页面已经移除。</p>
  <p><a href="/">返回首页</a></p>
</main>
</body>
</html>
`;

export function onRequest() {
  return new Response(gone_page, {
    status: 410,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
