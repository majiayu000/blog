import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("构建和增量重建不发布草稿目录，Pagefind 只索引公开文章", () => {
  const projectDir = path.join(import.meta.dirname, "..");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-build-"));
  const postsDir = path.join(root, "src", "posts");
  const draftDir = path.join(postsDir, "draft-post");
  const draftOutput = path.join(root, "_site", "posts", "draft-post");
  const draftHtml = `<!doctype html><html lang="en"><head><title>Draft</title>
<meta name="date" content="2026-01-02"><meta name="tags" content="Agent">
<meta name="draft" content="true"></head><body><p>Private draft text</p></body></html>`;

  const run = (args) => {
    const result = Bun.spawnSync([process.execPath, ...args], {
      cwd: root,
      env: { ...process.env, ANALYTICS_ENABLED: "false", GISCUS_ENABLED: "false", CF_WEB_ANALYTICS_TOKEN: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = result.stdout.toString() + result.stderr.toString();
    if (result.exitCode !== 0) throw new Error(output);
    return output;
  };

  try {
    for (const name of ["eleventy.config.js", "package.json", "lib"]) {
      fs.cpSync(path.join(projectDir, name), path.join(root, name), { recursive: true });
    }
    fs.cpSync(path.join(projectDir, "src"), path.join(root, "src"), {
      recursive: true,
      filter: (source) => source !== path.join(projectDir, "src", "posts"),
    });
    fs.symlinkSync(path.join(projectDir, "node_modules"), path.join(root, "node_modules"), "dir");
    fs.mkdirSync(path.join(postsDir, "published"), { recursive: true });
    fs.writeFileSync(path.join(postsDir, "published", "index.html"), draftHtml
      .replace("<title>Draft</title>", "<title>Published</title>")
      .replace('content="true"', 'content="false"')
      .replace("Private draft text", "Published article text"));
    fs.writeFileSync(path.join(postsDir, "published", "attachment.txt"), "Public attachment");
    fs.mkdirSync(path.join(draftDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(draftDir, "index.html"), draftHtml);
    fs.writeFileSync(path.join(draftDir, "assets", "private.txt"), "Private attachment");

    const output = run(["run", "build"]);
    expect(fs.existsSync(draftOutput)).toBe(false);
    expect(output).toMatch(/Indexed 1 page\b/);
    expect(fs.readFileSync(path.join(root, "_site", "posts", "published", "index.html"), "utf8"))
      .toContain("Published article text");
    expect(fs.readFileSync(path.join(root, "_site", "posts", "published", "attachment.txt"), "utf8"))
      .toBe("Public attachment");

    // 不清空 _site，验证 dev 使用的同一重建步骤会移除已发布后改回草稿的目录。
    fs.writeFileSync(path.join(draftDir, "index.html"), draftHtml.replace('content="true"', 'content="false"'));
    run(["run", "eleventy"]);
    expect(fs.existsSync(path.join(draftOutput, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(draftOutput, "assets", "private.txt"))).toBe(true);
    fs.writeFileSync(path.join(draftDir, "index.html"), draftHtml);
    run(["run", "eleventy"]);
    expect(fs.existsSync(draftOutput)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
