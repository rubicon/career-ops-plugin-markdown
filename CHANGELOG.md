# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-07-30

First published release. A `0.1.0` was written up during development but never tagged or released, so the tag history begins at `v0.1.1` and the initial feature set is recorded here.

### Added

- Markdown resume export for career-ops, generated directly from `cv.md` through the plugin `export` hook ([d19e128](https://github.com/rubicon/career-ops-plugin-markdown/commit/d19e128135ee1b900e093a67311ca8d6251b9211)).
- Support for the `cv.md` heading hierarchy: `##` sections, `###` company and role entries, and `####` nested sub-roles for fractional, interim, and umbrella engagements.
- Deterministic, markdownlint-compliant output with a shipped `.markdownlint.json` config.
- Standalone CLI (`bin/generate-markdown.mjs`) for exporting any Markdown CV outside career-ops.
- Configurable `cv_path` and `output_dir` settings.
- Dependency-free engine, relative modules plus Node built-ins only, with a zero-network smoke test.
- A non-personal example CV at `examples/cv-fractional-example.md`.

### Release pipeline

- Release automation now reads its GitHub App credentials from a 1Password service account at run time instead of per-repo secrets, so the signing identity behind a published release is rotated in one place ([#10](https://github.com/rubicon/career-ops-plugin-markdown/pull/10)).

[Unreleased]: https://github.com/rubicon/career-ops-plugin-markdown/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/rubicon/career-ops-plugin-markdown/releases/tag/v0.1.1
