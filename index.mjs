// @ts-check
// career-ops-plugin-markdown: export your cv.md to a clean, markdownlint-clean
// Markdown resume.
// Guide: https://github.com/santifer/career-ops/blob/main/docs/PLUGINS.md
//
// This is a local, no-network, no-key plugin. It uses the `export` hook (the
// consumer hook that produces an artifact) to render the user's own CV file to
// a Markdown document. It does not read or push the tracker snapshot. A CV
// export is about cv.md, not the pipeline, so the snapshot argument is ignored
// on purpose. All work is local: read cv.md, write output/cv-<name>.md.
//
// Registry rules honored: no bare (npm) imports, no network, no child_process.
// The engine (lib/cv-markdown.mjs) is pure string assembly, no builtins needed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildCvMarkdown, parseCvMarkdown } from './lib/cv-markdown.mjs';

/**
 * Kebab-case a candidate name for the output filename; falls back to "cv".
 * @param {string} name
 * @returns {string}
 */
function slug(name) {
  const s = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'cv';
}

/**
 * Resolve a user-supplied relative path and refuse anything that escapes the
 * project root (a crafted cv_path/output_dir must not read or write outside it).
 * @param {string} root
 * @param {string} rel
 * @returns {string} Absolute path inside root.
 */
function containedPath(root, rel) {
  const abs = path.resolve(root, rel);
  const within = abs === root || abs.startsWith(root + path.sep);
  if (!within) throw new Error(`path "${rel}" escapes the project directory`);
  return abs;
}

export default {
  /**
   * Render the user's cv.md to a Markdown resume in their output directory.
   *
   * @param {Readonly<object>} _snapshot - The tracker snapshot (unused: a CV export reads cv.md, not the pipeline).
   * @param {{settings?: Record<string, unknown>, log?: (...a: unknown[]) => void, dryRun?: boolean}} ctx - Plugin context.
   * @returns {Promise<{pushed: number}>}
   */
  async export(_snapshot, ctx) {
    const settings = (ctx && ctx.settings) || {};
    const log = (ctx && ctx.log) || console.log;
    const root = process.cwd();

    const cvPath = containedPath(
      root,
      typeof settings.cv_path === 'string' ? settings.cv_path : 'cv.md',
    );
    const outDir = containedPath(
      root,
      typeof settings.output_dir === 'string' ? settings.output_dir : 'output',
    );

    let markdown;
    try {
      markdown = readFileSync(cvPath, 'utf8');
    } catch {
      log(`markdown: no CV found at ${path.relative(root, cvPath) || 'cv.md'}, nothing to export.`);
      return { pushed: 0 };
    }

    const name = parseCvMarkdown(markdown).name;
    const outPath = path.join(outDir, `cv-${slug(name)}.md`);
    const relOut = path.relative(root, outPath);

    if (ctx && ctx.dryRun) {
      log(
        `markdown: would write ${relOut} from ${path.relative(root, cvPath)} (--dry-run: not written).`,
      );
      return { pushed: 0 };
    }

    const rendered = buildCvMarkdown(markdown);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, rendered);
    log(`markdown: wrote ${relOut} (${(rendered.length / 1024).toFixed(1)} KB).`);
    return { pushed: 1 };
  },
};
