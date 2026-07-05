# Architecture

career-ops-plugin-markdown turns a Markdown CV into a clean, markdownlint-clean
Markdown resume. It is a career-ops plugin, so it must be dependency-free:
relative modules plus allowlisted Node built-ins only, no network, no process
spawning.

## Layout

```text
career-ops-plugin-markdown/
  manifest.json            # plugin manifest (export hook, no env, no hosts)
  index.mjs                # the export hook: read cv.md, write output/cv-<name>.md
  lib/
    cv-markdown.mjs        # parser (Markdown -> structure) + Markdown renderer
  bin/
    generate-markdown.mjs  # standalone CLI, for use outside career-ops
  test/
    smoke.mjs              # zero-network smoke test
  examples/
    cv-fractional-example.md   # non-personal sample CV
```

## Design boundary: parser and renderer are separate

`lib/cv-markdown.mjs` has two halves that do not depend on each other's
internals:

1. **`parseCvMarkdown(markdown)`** turns the CV Markdown into a plain data
   structure that preserves the heading hierarchy: sections (`##`), entries
   (`###`), and nested sub-roles (`####`). This is pure and reusable on its own.
2. **The renderer** turns that structure back into a Markdown resume string via a
   small block builder.

Keeping these apart means the parser can back other renderers (a differently
styled Markdown resume, a different format) without change, and the renderer can
be reasoned about as pure string assembly.

## Why a block builder

markdownlint compliance is mostly about blank-line discipline: headings and lists
must be surrounded by blank lines (MD022, MD032), there must be no consecutive
blank lines (MD012), and the file must end with exactly one newline (MD047). The
renderer accumulates each heading, paragraph, and list as a discrete block, then
joins them with exactly one blank line. That makes the spacing correct by
construction rather than by post-processing, so the output is clean and
deterministic (identical input yields identical bytes).

## The `####` hierarchy

The single most important behavior is that a `####` heading renders as a nested
sub-role under its parent `###`. That is what represents fractional, interim, and
umbrella engagements (several client engagements under one advisory umbrella)
instead of flattening them into separate jobs. Nested sub-roles keep their own
date on the heading line (appended as `-- <date>`) and their own bullets.

## Data flow

```text
cv.md ──> parseCvMarkdown ──> { name, contact, sections[ blocks[ entry[ subroles[] ] ] ] }
                                   │
                                   ▼
                         renderMarkdown -> block builder
                                   │
                                   ▼
                    join blocks ──> cv-<name>.md (string)
```
