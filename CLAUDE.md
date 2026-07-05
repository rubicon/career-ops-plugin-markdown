# Agent Instructions

This is the canonical instruction file for AI coding agents working in this
repository. `AGENTS.md` is a pointer to this file.

## What this project is

career-ops-plugin-markdown is a [career-ops](https://github.com/santifer/career-ops)
plugin that exports a Markdown CV (`cv.md`) to a clean, markdownlint-compliant
Markdown resume. It is small, local, and single-purpose. Its reason to exist is
the `####` nested sub-role: a `###` company/umbrella entry holds several `####`
client engagements (fractional, interim, umbrella work) instead of flattening
them into separate jobs.

See `ARCHITECTURE.md` for the layout and data flow. Entry points: `index.mjs`
(the `export` hook), `lib/cv-markdown.mjs` (parser + Markdown renderer),
`bin/generate-markdown.mjs` (standalone CLI).

## Non-negotiable invariants

- **Dependency-free at runtime.** The career-ops plugin registry rejects any bare
  (npm) import in plugin source. Use relative modules and the allowlisted Node
  built-ins only (`node:fs`, `node:path`, `node:url`, `node:assert`, and the rest
  of the allowlist). No network, no `child_process`, no `worker_threads`, no
  `eval`. Dev tooling (Prettier, commitlint, markdownlint) is fine because it is
  never imported by plugin source.
- **Human-in-the-loop.** The plugin writes a document you review. It never submits
  anything anywhere. `manifest.json` keeps `humanInTheLoop: true`.
- **Generic, markdownlint-clean output.** The export is portable Markdown that
  passes markdownlint under the repo config. Person-specific branding belongs in
  a fork, not here.
- **No personal data in the repo.** Tests and examples use the non-personal
  fixture only (`examples/cv-fractional-example.md`). Never commit a real CV.
- **Contained file access.** `cv_path` and `output_dir` are resolved and checked
  to stay inside the project directory. Keep that guard.

## Commands

- `npm test` runs the zero-network smoke test (parser, nested sub-roles, output
  validity, determinism, markdownlint-shape assertions).
- `npm run format:check` / `npm run format` (Prettier).
- `npm run sample` generates `output/cv-priya-okonkwo-reyes.md` from the example.
- `npm run lint:md` runs markdownlint on the docs and the generated resume.
- In career-ops: `node plugins.mjs run markdown export [--dry-run]` writes
  `output/cv-<name>.md`.
- Standalone: `npm run cv -- <input.md> <output.md>` (wraps `bin/generate-markdown.mjs`).

## Working conventions

- Conventional Commits; commit messages are linted in CI.
- No AI-authorship trailers, no "Generated with" lines. No em-dashes, no emojis in
  code, comments, docs, commits, issues, or PRs. Use `--` for a dash separator.
- Run `npm test`, `npm run format:check`, and `npm run sample && npm run lint:md`
  before opening a PR.
- Keep the parser (`parseCvMarkdown`) and the Markdown renderer separate.

## Fixtures

`examples/cv-fractional-example.md` is the canonical test input. It exercises the
`####` nested sub-role convention (an advisory umbrella with several client
engagements) as well as ordinary roles. Extend it rather than adding a real CV.
