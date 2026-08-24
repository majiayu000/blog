# Contributing

This is a personal blog, so content changes are not open to contribution.
Fixes to the site machinery (build, templates, styling, tooling) are welcome.

## Setup

```bash
git clone https://github.com/majiayu000/blog.git
cd blog
bun install
```

## Develop

```bash
bun run dev      # preview at http://localhost:5567
bun run build    # output to _site/
bun test         # metadata parsing and fail-closed behaviour
```

Both `bun test` and `bun run build` must pass before a pull request is opened;
CI runs the same two commands.

## Ground rules

- **Authored post bytes are preserved.** The build may append only the controlled
  SEO head block and afterword defined in `lib/enhance-posts.js`; rewriting,
  reformatting or re-rendering the source article remains out of scope.
- **Keep metadata parsing fail-closed.** Missing or invalid metadata must fail
  the build and name the file. Do not add fallbacks that infer a title from the
  directory name or default a date to today.
- Every fix comes with a test.
- Commit messages explain *why*, not just *what*.
