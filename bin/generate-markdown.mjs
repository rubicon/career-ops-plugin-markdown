#!/usr/bin/env node
// @ts-check
/**
 * generate-markdown.mjs: standalone CLI for the CV-to-Markdown engine.
 *
 * Usage:
 *   node bin/generate-markdown.mjs <input.md> <output.md>
 *
 * Reads a Markdown CV (cv.md-style) and writes a clean, markdownlint-compliant
 * Markdown resume. The plugin's export hook (index.mjs) shares the same engine
 * (lib/cv-markdown.mjs); this CLI exists so the exporter is usable directly,
 * outside the plugin engine.
 */

import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildCvMarkdown } from '../lib/cv-markdown.mjs';

async function main() {
  const args = process.argv.slice(2);
  let inputPath;
  let outputPath;

  for (const arg of args) {
    if (!inputPath) inputPath = arg;
    else if (!outputPath) outputPath = arg;
  }

  if (!inputPath || !outputPath) {
    console.error('Usage: node bin/generate-markdown.mjs <input.md> <output.md>');
    process.exit(1);
  }

  inputPath = resolve(inputPath);
  outputPath = resolve(outputPath);

  // Path-traversal guard: keep the write inside the working directory so a
  // crafted output argument (e.g. "../../etc/cron.d/x") cannot escape it.
  const relOut = relative(process.cwd(), outputPath);
  if (relOut === '' || relOut.startsWith('..') || isAbsolute(relOut)) {
    console.error(`Refusing to write the resume outside the working directory: ${outputPath}`);
    process.exit(1);
  }

  const markdown = readFileSync(inputPath, 'utf-8');
  const rendered = buildCvMarkdown(markdown);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered);

  console.log(
    `Markdown resume generated: ${outputPath} (${(rendered.length / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error('Markdown generation failed:', err.message);
  process.exit(1);
});
