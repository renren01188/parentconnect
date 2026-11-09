<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository guidance

Before a task, read [docs/architecture.md](docs/architecture.md) and
[docs/progress.md](docs/progress.md) when they cover the area being changed.
They are navigation aids, not a substitute for inspecting the relevant source.

- Start with targeted `rg` searches and the specific page, route, utility, and
  focused test involved; avoid a full repository scan unless the documents no
  longer provide enough direction.
- Inspect the relevant implementation before editing it, including its
  authorization and validation path where applicable.
- Update `docs/architecture.md` when a related implementation path or flow
  changes, and update `docs/progress.md` when task status, affected files, or
  verification results change.
- Keep both documents concise, factual, and free of secrets.
