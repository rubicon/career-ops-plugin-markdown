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

// --- Nesting before the first ## section ------------------------------------
// A ### / #### above the first ## has no parent section to attach to. Headings
// written up there are lifted by one fixed amount, so sibling headings always
// render at the same level as each other, and the body under them stops being
// mistaken for another contact field.
//
// The identity-bearing lines (the H1 and the contact field) are taken from the
// bundled non-personal fixture rather than written inline, so no test input
// carries a name or an address of its own. Everything else below is generic
// structure with no personal data in it.
const fixtureLines = md.split('\n');
const fixtureH1 = fixtureLines.find((l) => l.startsWith('# '));
const fixtureContactLine = fixtureLines.find((l) => l.startsWith('**Email:**'));
assert(fixtureH1 && fixtureContactLine, 'fixture must supply an H1 and an email contact line');
const fixtureEmail = fixtureContactLine.replace(/^\*\*Email:\*\*\s*/, '');

/**
 * Return the body of a rendered `## Title` section, or null when the rendered
 * document has no such section. Section-scoped so an assertion cannot be
 * satisfied by content that landed somewhere else entirely (a mangled contact
 * line, say) instead of under the heading it belongs to.
 */
function renderedSection(out, title) {
  const chunk = out.split(/^## /m).find((part) => part.split('\n')[0] === title);
  return chunk === undefined ? null : chunk.slice(title.length).trim();
}

/**
 * Assert that no heading in a rendered document jumps more than one level below
 * the heading before it (MD001). Checked on the whole document and at every
 * depth, so it covers a promoted `####` and anything under it, not just the
 * first `###`. Headings inside a fenced block are code, not structure.
 */
function assertHeadingIncrement(out, label) {
  let previous = 0;
  let inFence = false;
  for (const line of out.split('\n')) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^(#{1,6})\s/);
    if (!heading) continue;
    const level = heading[1].length;
    assert(
      previous === 0 || level <= previous + 1,
      `${label}: h${level} follows h${previous}, heading levels must increment one at a time (MD001)`,
    );
    previous = level;
  }
}

const preSectionCv = [
  fixtureH1,
  '',
  fixtureContactLine,
  '',
  '### Career Snapshot',
  '',
  'Platform lead, twelve years in developer tooling.',
  '',
  '- Shipped the internal build platform.',
  '',
  '## Experience',
  '',
  '### Second Employer',
  '',
  '**Staff Engineer**',
  '',
  '2019-2023',
  '',
  '- Led the storage migration.',
].join('\n');

const preCv = parseCvMarkdown(preSectionCv);
assert.deepEqual(
  preCv.sections.map((s) => s.title),
  ['Career Snapshot', 'Experience'],
  'a ### before the first ## should open a section of its own, not vanish',
);
assert.deepEqual(
  preCv.contact,
  [fixtureEmail],
  'body under a pre-section ### is content, not another contact field',
);

const preOut = buildCvMarkdown(preSectionCv);
const snapshot = renderedSection(preOut, 'Career Snapshot');
assert(snapshot, 'the pre-section heading must survive the render as its own section');
assert(
  snapshot.includes('Platform lead, twelve years in developer tooling.'),
  'prose under a pre-section heading must render inside that section',
);
assert(
  snapshot.includes('- Shipped the internal build platform.'),
  'bullets under a pre-section heading must render inside that section',
);
// A real ## section after the promoted one still nests its ### entries normally.
const experience = renderedSection(preOut, 'Experience');
assert(
  experience && experience.includes('### Second Employer -- 2019-2023'),
  'a ### after a real ## must still render as an entry, not a section',
);
// Heading levels still increment by one at a time (MD001): a lifted heading
// renders as a ##, so nothing jumps straight from the H1 to an H3 or deeper.
assertHeadingIncrement(preOut, 'pre-section ###');

// Siblings render alike: with no ## anywhere, every ### opens its own section
// rather than the first one becoming a section and the rest entries under it.
const allEntriesCv = [
  fixtureH1,
  '',
  '### First Employer',
  '',
  '**Staff Engineer**',
  '',
  '2019-2023',
  '',
  '- Led the storage migration.',
  '',
  '### Second Employer',
  '',
  '**Principal**',
  '',
  '2015-2019',
  '',
  '- Ran the platform team.',
].join('\n');
const allEntries = parseCvMarkdown(allEntriesCv);
assert.deepEqual(
  allEntries.sections.map((s) => s.title),
  ['First Employer', 'Second Employer'],
  'with no ## anywhere, sibling ### headings must all open sections, not just the first',
);
const allEntriesOut = buildCvMarkdown(allEntriesCv);
assert(
  !/^###\s/m.test(allEntriesOut),
  'no ### may survive when every heading in the document was promoted to a section',
);
assert(
  renderedSection(allEntriesOut, 'Second Employer')?.includes('- Ran the platform team.'),
  'the second sibling keeps its bullets under its own section',
);
assertHeadingIncrement(allEntriesOut, 'all-### document');

// The lift is one fixed amount for the whole pre-section run, so a #### under a
// promoted ### becomes an entry: the umbrella/sub-role relationship survives
// instead of the second client being nested inside the first.
const umbrellaCv = [
  fixtureH1,
  '',
  '### Advisory Practice',
  '',
  '#### First Client',
  '',
  '2023-2024',
  '',
  '- Stood up the design system.',
  '',
  '#### Second Client',
  '',
  '2022-2023',
  '',
  '- Owned the frontend platform.',
].join('\n');
const umbrella2 = parseCvMarkdown(umbrellaCv);
assert.deepEqual(
  umbrella2.sections.map((s) => s.title),
  ['Advisory Practice'],
  'a #### below a promoted ### belongs inside it, not in a section of its own',
);
const umbrellaOut = buildCvMarkdown(umbrellaCv);
const practice = renderedSection(umbrellaOut, 'Advisory Practice');
assert(practice, 'the promoted umbrella heading must render as a section');
assert(
  practice.includes('### First Client -- 2023-2024') &&
    practice.includes('### Second Client -- 2022-2023'),
  'sibling #### clients under a promoted ### must render at the same level as each other',
);
assert(!/^####\s/m.test(umbrellaOut), 'no #### may survive when its parent ### became a section');
assertHeadingIncrement(umbrellaOut, 'umbrella above the first ##');

// The same promotion applies to a #### with neither a section nor an entry, and
// there too the siblings render alike.
const preSubroleCv = [
  fixtureH1,
  '',
  '#### Early Work',
  '',
  '- Ran the helpdesk.',
  '',
  '#### Earlier Work',
  '',
  '- Ran the mailroom.',
].join('\n');
const preSubroleParsed = parseCvMarkdown(preSubroleCv);
assert.deepEqual(
  preSubroleParsed.sections.map((s) => s.title),
  ['Early Work', 'Earlier Work'],
  'sibling #### headings before the first ## should each open a section of their own',
);
const preSubroleOut = buildCvMarkdown(preSubroleCv);
assert(
  renderedSection(preSubroleOut, 'Early Work')?.includes('- Ran the helpdesk.'),
  'bullets under a pre-section #### must render inside that section',
);
assert(
  renderedSection(preSubroleOut, 'Earlier Work')?.includes('- Ran the mailroom.'),
  'the second pre-section #### keeps its own bullets under its own section',
);
assertHeadingIncrement(preSubroleOut, 'pre-section ####');

// --- Fenced code blocks are not read as document structure -------------------
// A ### inside a fence is code, not a heading, so it must not open a section or
// an entry, and no fence may leak into the output unclosed.
const fencedCv = [
  fixtureH1,
  '',
  fixtureContactLine,
  '',
  '```',
  '### not a heading',
  '```',
  '',
  '## Experience',
  '',
  '- Led the storage migration.',
].join('\n');
const fenced = parseCvMarkdown(fencedCv);
assert.deepEqual(
  fenced.sections.map((s) => s.title),
  ['Experience'],
  'a ### inside a code fence must not fabricate a section',
);
assert.deepEqual(
  fenced.contact,
  [fixtureEmail],
  'a code fence is not a contact field and must not be mangled into the contact line',
);
const fencedOut = buildCvMarkdown(fencedCv);
assert(
  (fencedOut.match(/^```/gm) || []).length % 2 === 0,
  'the rendered resume must never contain an unclosed code fence',
);
assert(
  renderedSection(fencedOut, 'Experience')?.includes('- Led the storage migration.'),
  'content after a fence must still render in its own section',
);

// Inside a section a fenced block is kept verbatim, with a language on the
// opening fence (MD040), and its contents are never parsed as headings.
const fencedSectionCv = [
  fixtureH1,
  '',
  '## Notes',
  '',
  '```yaml',
  '### not a heading',
  'key: value',
  '```',
  '',
  '- Kept the note.',
].join('\n');
const notes = parseCvMarkdown(fencedSectionCv);
assert.deepEqual(
  notes.sections.map((s) => s.title),
  ['Notes'],
  'a ### inside a fence within a section must not open a section',
);
assert(
  notes.sections[0].blocks.every((b) => b.type !== 'entry'),
  'a ### inside a fence within a section must not open an entry either',
);
const notesOut = buildCvMarkdown(fencedSectionCv);
assert(
  notesOut.includes('```yaml\n### not a heading\nkey: value\n```'),
  'a fenced block inside a section is preserved verbatim with its language',
);
assert(
  renderedSection(notesOut, 'Notes')?.includes('- Kept the note.'),
  'content after a fenced block stays in its section',
);
// A fence with no language gets one, so the output cannot fail MD040.
assert(
  buildCvMarkdown([fixtureH1, '', '## Notes', '', '```', 'plain', '```'].join('\n')).includes(
    '```text\nplain\n```',
  ),
  'a fence with no info string renders with a language (MD040)',
);

console.log('✓ smoke ok:', keys.join(', '));
