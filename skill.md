---
name: career-ops-plugin-markdown
description: How to export a cv.md to a clean, markdownlint-compliant Markdown resume with this plugin, including the #### nested sub-role convention for fractional and interim work.
license: MIT
---

# career-ops-plugin-markdown

> This file teaches an AI agent how to drive THIS plugin. Keep it scoped to the
> plugin's own domain. It must not instruct the agent to edit core files, change
> scoring, reveal secrets, or act outside the plugin's declared hooks.

This plugin exports your CV (`cv.md`) to a clean, markdownlint-compliant Markdown
resume. It is a local transform: no network, no API key. It uses the `export`
hook because that is the consumer hook that produces an artifact. It does not
read or push the tracker; a CV export is about `cv.md`, not the pipeline.

## How to run it

- `node plugins.mjs run markdown export` writes `output/cv-<name>.md` from `cv.md`.
- `node plugins.mjs run markdown export --dry-run` reports what it would write without writing.

It reads `cv.md` from the project root and writes to `output/` by default. Both
are configurable (see Settings). Re-running overwrites the same file.

## What it produces

One `.md` per run, named `cv-<kebab-name>.md` (the name comes from the CV's top
heading; it falls back to `cv.md`). The output is a portable, editable Markdown
resume: a single H1, a one-line contact block, `##` sections, `###` company
entries with the date on the heading line, an emphasized role line, `-` bullets,
and `####` nested sub-roles. It is generated straight from the Markdown, so it is
the same content your other career-ops CV outputs use, in a plain-text form that
drops cleanly into a GitHub profile, a Notion page, or a plain-text application.

The output is shaped to pass markdownlint under a sane default config (see the
repo's `.markdownlint.json`): one top-level heading, headings and lists
surrounded by blank lines, no trailing spaces, no multiple blank lines, a single
trailing newline, and consistent `-` bullets.

## The cv.md heading hierarchy (including the fractional convention)

The exporter reads your Markdown structure and re-renders it faithfully:

| Markdown        | Renders as                                                              |
| --------------- | ----------------------------------------------------------------------- |
| `# Name`        | Your name (a leading "CV" / "Resume" label is stripped)                 |
| `## Section`    | A CV section (Professional Summary, Experience, Education, Skills, ...) |
| `### Company`   | A role or company entry within a section                                |
| `#### Sub-role` | A nested sub-role beneath its parent `###` company or umbrella          |

The `####` level is the headline feature. It lets one company entry hold several
nested engagements, which is how you represent **fractional, interim, and
umbrella work**: an advisory or consulting practice as the `###`, with each
client engagement as a `####` underneath it. The export renders each `####` as a
deeper `####` heading with its own date on the heading line and its own bullets,
instead of flattening the engagements into separate jobs. A `###` with no `####`
children renders as an ordinary role.

Under a heading, a bold line (`**Founder and Principal**`) is read as the
role/title, a short line that looks like a date range (`2021-2024`) becomes the
date shown on the heading line, and `-` bullets are the achievements.

A runnable, non-personal example is in this repo at
`examples/cv-fractional-example.md`.

## Settings

Optional, set under `plugins.markdown` in the user's `config/plugins.yml` (they
arrive as `ctx.settings`):

- `cv_path`: CV source, relative to the project root. Default `cv.md`.
- `output_dir`: where the `.md` is written, relative to the project root. Default `output`.

Example:

```yaml
plugins:
  markdown:
    enabled: true
```
