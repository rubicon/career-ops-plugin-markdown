// Zero-network smoke test. Verifies the manifest/index hook contract, the CV
// Markdown hierarchy parsing (including #### nested sub-roles), and that the
// engine emits a clean, deterministic, structurally sane Markdown resume. Run by
// CI and by `plugins.mjs add` at install time. Uses only allowlisted node:
// builtins.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCvMarkdown, buildCvMarkdown } from '../lib/cv-markdown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const KINDS = ['provider', 'ingest', 'search', 'notify', 'export'];

// --- Manifest / index hook contract (the template's baseline check) ---------
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const mod = await import(path.join(root, manifest.entry || 'index.mjs'));
const hooks = mod.default;

assert(hooks && typeof hooks === 'object', 'default export must be an object of hooks');
const keys = Object.keys(hooks);
assert(keys.length > 0, 'declare at least one hook');
for (const k of keys) assert(KINDS.includes(k), `unknown hook "${k}"`);
for (const h of manifest.hooks)
  assert(keys.includes(h), `manifest declares hook "${h}" but index.mjs does not export it`);
assert(typeof hooks.export === 'function', 'export hook must be a function');
assert(manifest.humanInTheLoop === true, 'humanInTheLoop must be true');

// --- Hierarchy parsing on the bundled non-personal fixture ------------------
const md = readFileSync(path.join(root, 'examples', 'cv-fractional-example.md'), 'utf8');
const cv = parseCvMarkdown(md);

assert.equal(cv.name, 'Priya Okonkwo-Reyes', 'H1 should parse to the name (label stripped)');
assert(cv.contact.length >= 3, 'contact block should carry several fields');
const titles = cv.sections.map((s) => s.title);
for (const t of [
  'Professional Summary',
  'Experience',
  'Selected Projects',
  'Education',
  'Skills',
]) {
  assert(titles.includes(t), `missing section "${t}"`);
}

const exp = cv.sections.find((s) => s.title === 'Experience');
const umbrella = exp.blocks.find(
  (b) => b.type === 'entry' && /Reyes Systems Studio/.test(b.company),
);
assert(umbrella, 'umbrella entry not found');
assert.equal(umbrella.subroles.length, 3, 'umbrella should hold 3 nested #### sub-roles');
assert(/Lumen Health/.test(umbrella.subroles[0].title), 'first sub-role title wrong');
assert.equal(umbrella.subroles[0].date, '2023-2024', 'sub-role date wrong');
assert.equal(umbrella.subroles[0].bullets.length, 3, 'sub-role should keep its own bullets');

const standard = exp.blocks.find((b) => b.type === 'entry' && /Brightloom/.test(b.company));
assert(standard, 'standard entry not found');
assert.equal(standard.subroles.length, 0, 'a ### with no #### should have no sub-roles');
assert(
  standard.role && standard.date && standard.bullets.length === 3,
  'standard role should keep role/date/bullets',
);

// --- Output validity: a clean, structurally sane Markdown resume ------------
const out = buildCvMarkdown(md);
assert(typeof out === 'string' && out.length > 500, 'output should be a non-trivial string');

// Exactly one top-level heading (MD025).
const h1Count = out.split('\n').filter((l) => /^#\s/.test(l)).length;
assert.equal(h1Count, 1, 'resume must have exactly one H1');

// Ends with a single trailing newline (MD047), no trailing whitespace (MD009),
// no tab characters, and no consecutive blank lines (MD012).
assert(out.endsWith('\n') && !out.endsWith('\n\n'), 'output should end with exactly one newline');
assert(!/[ \t]+\n/.test(out), 'no trailing spaces on any line (MD009)');
assert(!/\t/.test(out), 'no tab characters in the output');
assert(!/\n\n\n/.test(out), 'no consecutive blank lines (MD012)');

// No em-dash or en-dash survives; dates render on the heading line via " -- ".
assert(!/[—–]/.test(out), 'no em-dash or en-dash in the rendered resume');
assert(out.includes('### Reyes Systems Studio'), 'umbrella heading should render');
assert(/#### Lumen Health.* -- .*2023-2024/.test(out), 'sub-role heading should carry its date');

// Deterministic: identical input yields identical bytes.
const again = buildCvMarkdown(md);
assert.equal(out, again, 'output should be deterministic for identical input');

console.log('✓ smoke ok:', keys.join(', '));
