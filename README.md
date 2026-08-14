# career-ops-plugin-markdown

Export your `cv.md` to a clean, markdownlint-compliant Markdown resume, straight
from the Markdown. A [career-ops](https://github.com/santifer/career-ops)
community plugin.

[![CI](https://github.com/rubicon/career-ops-plugin-markdown/actions/workflows/ci.yaml/badge.svg)](https://github.com/rubicon/career-ops-plugin-markdown/actions/workflows/ci.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What it does

career-ops generates CVs as PDF and LaTeX, and a sibling plugin adds Word
`.docx`. This plugin adds an editable, plain-text **Markdown** resume, which is
what you reach for when you want to paste your CV into a GitHub profile, a Notion
page, a README, or a plain-text application box.

It reads your `cv.md` and writes one clean Markdown resume: a single H1, a
one-line contact block, `##` sections, `###` company entries with the date on the
heading line, an emphasized role line, `-` bullets, and `####` nested sub-roles.
The output is shaped to pass markdownlint, so it drops cleanly into any Markdown
host. It runs entirely on your machine: no network, no API key.

## Why Markdown

Same source, editable plain-text output. Unlike a binary Word or PDF export, the
result is diff-friendly, portable, and ready to paste anywhere Markdown renders:
GitHub and GitLab profiles, Notion, Obsidian, static-site resumes, and
plain-text application forms. It is the lowest-friction way to keep one canonical
CV and reuse it everywhere.

## The headline feature: `####` nested sub-roles

The exporter honors your Markdown heading hierarchy, and the `####` level is the
reason this plugin exists:

| Markdown        | Renders as                                        |
| --------------- | ------------------------------------------------- |
| `# Name`        | Your name                                         |
| `## Section`    | A CV section (Experience, Education, Skills, ...) |
| `### Company`   | A role or company entry                           |
| `#### Sub-role` | A nested sub-role under its parent `###`          |

That `####` level lets one company entry hold several nested engagements, which
is how you represent **fractional, interim, and umbrella work**: an advisory or
consulting practice as the `###`, with each client engagement as a `####`
underneath it. Each nested sub-role keeps its own date on the heading line and
its own bullets, instead of being flattened into separate jobs. A `###` with no
`####` children renders as an ordinary role.

A `###` or `####` written above the first `##` has no section to sit under, so it
is lifted until it has one, and its body comes with it. The lift is a single
amount for the whole run above the first `##`, fixed by the first such heading,
so headings written at the same level up there always render at the same level as
each other: a CV with no `##` at all gets one section per `###`, and a `###`
umbrella with `####` engagements under it keeps that shape one level up.

Two things are still not carried across. A heading deeper than `####` (an `#####`
or below) has no place in this hierarchy and is left where it is. And a fenced
code block is content rather than structure, so nothing inside it is read as a
heading; one written before the first section has no block to be held by and is
dropped, while one inside a section is kept as a code block.

There is a runnable, non-personal example at
[`examples/cv-fractional-example.md`](examples/cv-fractional-example.md). It
renders to this shape:

```markdown
### Reyes Systems Studio -- Remote (advisory practice)

_Founder and Principal, Fractional Design Systems_

- One or two umbrella-level bullets.

#### Lumen Health -- Interim Head of Design Systems -- 2023-2024

- Engagement-specific achievement.

#### Farro Commerce -- Fractional Frontend Architect -- 2022-2023

- Engagement-specific achievement.
```

## Install

This is a career-ops plugin. From your career-ops checkout:

```bash
node plugins.mjs add markdown
```

Then enable it in `config/plugins.yml`:

```yaml
plugins:
  markdown:
    enabled: true
```

## Usage

```bash
node plugins.mjs run markdown export            # writes output/cv-<name>.md from cv.md
node plugins.mjs run markdown export --dry-run  # report what it would write, write nothing
```

You can also run the exporter directly, outside career-ops, on any Markdown CV:

```bash
node bin/generate-markdown.mjs path/to/cv.md path/to/out.md
```

## Configuration

Optional settings under `plugins.markdown` in `config/plugins.yml`:

| Setting      | Default  | Meaning                                                  |
| ------------ | -------- | -------------------------------------------------------- |
| `cv_path`    | `cv.md`  | CV source, relative to the project root                  |
| `output_dir` | `output` | Where the `.md` is written, relative to the project root |

## markdownlint config

The generated resume is markdownlint-clean under the config in
[`.markdownlint.json`](.markdownlint.json). The engine satisfies these rules by
construction: one top-level heading (MD025), headings and lists surrounded by
blank lines (MD022, MD032), no trailing spaces (MD009), no consecutive blank
lines (MD012), a single trailing newline (MD047), and consistent `-` bullets
(MD004).

The config disables a few rules that fight a resume rather than help it:

- **MD013** (line length): resume bullets are legitimately long, so line-length
  wrapping is off.
- **MD024** is set to `siblings_only` so repeated headings under different
  parents are allowed.
- **MD033** (inline HTML) and **MD041** (first line must be a heading) are off,
  so the config also works when the resume is embedded in a larger document.
- **MD034** (bare URLs) is off so the contact line can carry a plain email and
  links, which is what you want in a portable, plain-text resume.
- **MD036** (emphasis used instead of a heading) is off because a role subtitle
  under a company heading is legitimately emphasis, not another heading level.

CI generates the sample resume and runs markdownlint on it plus the repo docs, so
the compliance claim is checked on every change.

## How it works

The engine parses `cv.md` into a small structure that preserves the heading
hierarchy, then re-renders it as a clean Markdown resume through a block builder
that guarantees markdownlint-clean spacing. It has no runtime dependencies: the
parser and renderer are pure string work, so it stays within the career-ops
plugin rules (dependency-free, no network, no process spawning). The parser and
the renderer are separate, so the parser is reusable on its own.

## Development

```bash
npm install        # dev tooling only (Prettier, commitlint, markdownlint); the plugin ships with no runtime deps
npm test           # zero-network smoke test
npm run format:check
npm run sample     # generate output/cv-priya-okonkwo-reyes.md from the example
npm run lint:md    # markdownlint the docs and the generated resume
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and discussion are welcome. This
plugin is human-in-the-loop by design: it never submits anything anywhere, it
only writes a document you review.

## License

MIT. See [LICENSE](LICENSE).

## Contributors

![Contributors](https://contrib.rocks/image?repo=rubicon/career-ops-plugin-markdown)
