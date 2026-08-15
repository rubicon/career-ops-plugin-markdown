// @ts-check
/**
 * cv-markdown.mjs: the CV-to-Markdown engine for career-ops-plugin-markdown.
 *
 * Pure and dependency-free: it takes a Markdown CV string and returns a clean,
 * markdownlint-compliant Markdown resume string, using only allowlisted node:
 * builtins (none are needed here) and no npm packages. career-ops registry
 * plugins may not import bare specifiers, so the parser and renderer are written
 * by hand. No filesystem, no CLI, no personal data. The parser and renderer stay
 * reusable and independent of each other.
 *
 * It parses cv.md generically from its Markdown hierarchy and re-renders one
 * clean, portable Markdown resume:
 *   # Name       -> the single H1 (a leading "CV" / "Resume" label is stripped)
 *   ## Section   -> a CV section (Summary, Experience, Education, Skills, ...)
 *   ### Company  -> a role / company entry within a section
 *   #### Sub-role -> a nested sub-role beneath its parent ### company/umbrella
 *
 * The #### level represents fractional, interim, and umbrella work (several
 * client engagements under one advisory/consulting company) as nested sub-roles
 * instead of separate jobs. A ### with no #### renders as an ordinary role.
 *
 * The output is deterministic (identical input yields identical bytes) and is
 * shaped to satisfy a sane markdownlint config: one top-level heading (MD025),
 * headings and lists surrounded by blank lines (MD022, MD032), no trailing
 * spaces (MD009), no consecutive blank lines (MD012), a single trailing newline
 * (MD047), and consistent `-` bullets (MD004).
 */

// --- Markdown -> structured CV ---------------------------------------------

/**
 * Strip a leading "CV" / "Resume" / "Curriculum Vitae" label from the H1 so the
 * document title is the person's name, not "CV -- Name".
 * @param {string} text
 * @returns {string}
 */
function stripNameLabel(text) {
  return text.replace(/^\s*(cv|resume|résumé|curriculum vitae)\s*[-–—:]+\s*/i, '').trim();
}

const DATE_RE = /\b(19|20)\d{2}\b|present|current|ongoing|now\b/i;
const BOLD_LINE_RE = /^\*\*(.+)\*\*$/;
const BULLET_RE = /^[-*]\s+(.*)$/;

/**
 * Detect whether a plain line reads as a date range rather than prose.
 * @param {string} line
 * @returns {boolean}
 */
function looksLikeDate(line) {
  if (line.length > 40) return false;
  return DATE_RE.test(line);
}

/**
 * Normalize any dash-style separator to a plain double hyphen so no em-dash or
 * en-dash survives into the rendered resume. Collapses surrounding spaces to a
 * single space on each side.
 * @param {string} text
 * @returns {string}
 */
function normalizeDashes(text) {
  return text.replace(/\s*[–—]\s*/g, ' -- ');
}

/**
 * Reduce inline Markdown to plain text (links -> label, drop emphasis/code
 * marks), then normalize dash separators.
 * @param {string} text
 * @returns {string}
 */
function stripInlineMarkdown(text) {
  return normalizeDashes(
    text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim(),
  );
}

/**
 * Keep inline Markdown emphasis (**bold**, *italic*, `code`, [links]) but
 * normalize dashes and collapse whitespace. Used for content that is re-emitted
 * as Markdown (bullets, summary prose) rather than flattened to plain text.
 * @param {string} text
 * @returns {string}
 */
function keepInlineMarkdown(text) {
  return normalizeDashes(text.replace(/\s+/g, ' ').trim());
}

// Fence matching follows CommonMark, where an opener and a closer are not the
// same shape. Up to three leading spaces still open a fence. A backtick fence's
// info string may not contain a backtick (that ambiguity is what makes inline
// code parseable); a tilde fence's info string may contain anything.
const BACKTICK_OPEN_RE = /^ {0,3}(`{3,})([^`]*)$/;
const TILDE_OPEN_RE = /^ {0,3}(~{3,})(.*)$/;

// A closer carries no info string at all, only trailing whitespace. Accepting one
// meant a ```yaml line written *inside* a ``` block closed it: the rest of the
// block was then read as CV structure and the author's real closing fence opened
// a second block over whatever followed.
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Match a line that opens a fenced block.
 * @param {string} raw
 * @returns {{fence: string, info: string}|null}
 */
function matchFenceOpen(raw) {
  const m = raw.match(BACKTICK_OPEN_RE) || raw.match(TILDE_OPEN_RE);
  return m ? { fence: m[1], info: m[2].trim() } : null;
}

/**
 * Parse a Markdown CV into an ordered structure that preserves the heading
 * hierarchy (## sections, ### company/role entries, #### nested sub-roles).
 *
 * Format-tolerant: role titles may be a bold line under the heading, dates are a
 * short line that looks like a date range, bullets attach to the nearest open
 * sub-role, else the open entry, else the section itself, and headings written
 * above the first ## are lifted so that nothing before the first section is lost.
 *
 * A fenced code block is taken verbatim: nothing inside it is read as a heading,
 * a bullet, or a contact field.
 *
 * @param {string} markdown
 * @returns {{name: string, contact: string[], sections: Array}}
 */
export function parseCvMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const cv = { name: '', contact: [], sections: [] };
  let section = null;
  let entry = null;
  let subrole = null;
  // A ## has been seen, so ### / #### below it have a container of their own.
  let sawSection = false;
  // How many levels to lift a heading written above the first ##. Fixed by the
  // first such heading and then applied to all of them, so siblings up there are
  // always rendered at the same level as each other.
  let orphanLift = 0;
  /** @type {{fence: string, info: string, lines: string[]}|null} */
  let fenced = null;

  const openSection = (title) => {
    section = { title: stripInlineMarkdown(title), blocks: [] };
    cv.sections.push(section);
    entry = null;
    subrole = null;
  };

  const openEntry = (title) => {
    entry = {
      type: 'entry',
      company: stripInlineMarkdown(title),
      role: null,
      date: null,
      bullets: [],
      subroles: [],
    };
    section.blocks.push(entry);
    subrole = null;
  };

  // A fenced block is content, never structure. It can only be held by an open
  // section, so one written above the first section (where the only container is
  // the single-line contact block) is dropped rather than mangled into it. An
  // empty block is still something the author wrote, so an open section keeps it.
  const closeFence = () => {
    if (section) {
      section.blocks.push({ type: 'code', info: fenced.info, lines: fenced.lines });
    }
    fenced = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (fenced) {
      const close = raw.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fenced.fence[0] && close[1].length >= fenced.fence.length) {
        closeFence();
      } else {
        fenced.lines.push(raw.replace(/[ \t]+$/, ''));
      }
      continue;
    }
    if (!line) continue;

    const open = matchFenceOpen(raw);
    if (open) {
      fenced = { fence: open.fence, info: open.info, lines: [] };
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const h4 = line.match(/^####\s+(.*)$/);

    if (h2) {
      sawSection = true;
      openSection(h2[1]);
      continue;
    }

    // Above the first ##, a ### / #### has no parent to attach to, so it is
    // lifted instead of dropped -- skipping it lost the heading outright and left
    // its body to be read as further contact fields, so the whole block came out
    // mangled into the contact line. The lift is one amount for the whole run,
    // set by the first orphan heading, so sibling headings never render at
    // different levels from each other. A heading lifted to ## opens a section,
    // one lifted to ### opens an entry inside it, and nothing is lifted past ##,
    // which keeps rendered levels incrementing one at a time (MD001).
    if (!sawSection && (h3 || h4)) {
      const level = h4 ? 4 : 3;
      if (!orphanLift) orphanLift = level - 2;
      if (level - orphanLift <= 2) openSection((h4 || h3)[1]);
      else openEntry((h4 || h3)[1]);
      continue;
    }

    if (h4) {
      const title = stripInlineMarkdown(h4[1]);
      if (!entry) {
        openEntry(h4[1]);
        continue;
      }
      subrole = { type: 'subrole', title, role: null, date: null, bullets: [] };
      entry.subroles.push(subrole);
      continue;
    }

    if (h3) {
      openEntry(h3[1]);
      continue;
    }

    if (h1) {
      cv.name = stripNameLabel(h1[1]);
      continue;
    }

    if (!section) {
      const labelled = line.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
      const value = labelled ? labelled[2].trim() : stripInlineMarkdown(line);
      if (value) cv.contact.push(stripInlineMarkdown(value));
      continue;
    }

    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const text = keepInlineMarkdown(bullet[1]);
      if (subrole) subrole.bullets.push(text);
      else if (entry) entry.bullets.push(text);
      else section.blocks.push({ type: 'bullet', text });
      continue;
    }

    const bold = line.match(BOLD_LINE_RE);
    if (bold) {
      const text = stripInlineMarkdown(bold[1]);
      if (subrole && !subrole.role) {
        subrole.role = text;
        continue;
      }
      if (entry && !entry.role) {
        entry.role = text;
        continue;
      }
    }

    if (looksLikeDate(line)) {
      if (subrole && !subrole.date) {
        subrole.date = normalizeDashes(line);
        continue;
      }
      if (entry && !entry.date) {
        entry.date = normalizeDashes(line);
        continue;
      }
    }

    const text = keepInlineMarkdown(line);
    if (subrole) subrole.bullets.push(text);
    else if (entry) entry.bullets.push(text);
    else section.blocks.push({ type: 'paragraph', text });
  }

  // A fence the author never closed still ends at the end of the document, so
  // keep what it holds rather than discarding the tail of the CV.
  if (fenced) closeFence();

  return cv;
}

// --- Markdown rendering -----------------------------------------------------

/**
 * A tiny block builder that keeps the output markdownlint-clean by construction:
 * each pushed block becomes one paragraph/heading/list, and blocks are joined by
 * exactly one blank line. That guarantees headings and lists are surrounded by
 * blank lines (MD022, MD032) and never produces consecutive blank lines (MD012).
 */
class Blocks {
  constructor() {
    /** @type {string[]} */
    this.items = [];
  }

  /**
   * Push a non-empty block (may be multi-line, e.g. a whole bullet list).
   * @param {string} block
   */
  push(block) {
    const trimmed = block.replace(/[ \t]+$/gm, '').replace(/\s+$/, '');
    if (trimmed) this.items.push(trimmed);
  }

  /**
   * Join the blocks into the final document: blank-line-separated, no trailing
   * whitespace, and exactly one trailing newline (MD047).
   * @returns {string}
   */
  toString() {
    return this.items.join('\n\n') + '\n';
  }
}

/**
 * Compose a company/role heading line with an optional trailing date. The date
 * is appended as ` -- <date>` (double hyphen, never an em-dash) so a reader sees
 * "Company -- 2021-2024" on the heading line itself.
 * @param {string} hashes - The heading prefix ("###" or "####").
 * @param {string} title
 * @param {string|null} date
 * @returns {string}
 */
function headingWithDate(hashes, title, date) {
  const base = `${hashes} ${title}`.replace(/[ \t]+$/g, '');
  return date ? `${base} -- ${date}` : base;
}

/**
 * Reduce an info string to one a backtick fence can carry. Every fence is emitted
 * with backticks so the document keeps one fence style (MD048), and a backtick
 * fence's info string may not contain a backtick -- which only a tilde fence in
 * the source can produce. Keeping the text up to the first backtick keeps the
 * language, which is the part that carries meaning, instead of emitting a fence
 * the reader's Markdown would not recognize.
 * @param {string} info
 * @returns {string}
 */
function fenceInfo(info) {
  const safe = info.includes('`') ? info.slice(0, info.indexOf('`')).trim() : info;
  return safe || 'text';
}

/**
 * Re-emit a fenced code block. The opening fence always carries a language so the
 * output cannot fail MD040, defaulting to `text` when the author gave none, and
 * the fence is long enough to survive any backtick run inside the block.
 * @param {string} info
 * @param {string[]} lines
 * @returns {string}
 */
function codeBlock(info, lines) {
  let longestRun = 0;
  for (const line of lines) {
    for (const run of line.match(/`+/g) || []) longestRun = Math.max(longestRun, run.length);
  }
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const open = `${fence}${fenceInfo(info)}`;
  // An empty block closes on the next line: joining no lines would otherwise put
  // a blank line inside a block the author left empty.
  return lines.length ? `${open}\n${lines.join('\n')}\n${fence}` : `${open}\n${fence}`;
}

/**
 * Render a list of bullets as a single `-` list block (one bullet per line).
 * @param {string[]} bullets
 * @returns {string}
 */
function bulletList(bullets) {
  return bullets.map((b) => `- ${b}`).join('\n');
}

/**
 * Render the parsed CV to a clean, markdownlint-compliant Markdown resume.
 * @param {ReturnType<typeof parseCvMarkdown>} cv
 * @returns {string}
 */
function renderMarkdown(cv) {
  const doc = new Blocks();

  // Single H1 (MD025): the name, or a neutral fallback so the document always
  // has exactly one top-level heading.
  doc.push(`# ${cv.name || 'Curriculum Vitae'}`);

  // Contact block: one portable line of "field | field | field".
  if (cv.contact.length) doc.push(cv.contact.join(' | '));

  for (const section of cv.sections) {
    doc.push(`## ${section.title}`);

    // A section can open with loose bullets/paragraphs before any ### entry.
    const looseBullets = [];
    for (const block of section.blocks) {
      if (block.type === 'bullet') {
        looseBullets.push(block.text);
      } else if (block.type === 'paragraph') {
        if (looseBullets.length) {
          doc.push(bulletList(looseBullets.splice(0)));
        }
        doc.push(block.text);
      } else if (block.type === 'code') {
        if (looseBullets.length) {
          doc.push(bulletList(looseBullets.splice(0)));
        }
        doc.push(codeBlock(block.info, block.lines));
      } else if (block.type === 'entry') {
        if (looseBullets.length) {
          doc.push(bulletList(looseBullets.splice(0)));
        }
        doc.push(headingWithDate('###', block.company, block.date));
        if (block.role) doc.push(`*${block.role}*`);
        if (block.bullets.length) doc.push(bulletList(block.bullets));

        for (const sr of block.subroles) {
          const title = sr.role ? `${sr.title} -- ${sr.role}` : sr.title;
          doc.push(headingWithDate('####', title, sr.date));
          if (sr.bullets.length) doc.push(bulletList(sr.bullets));
        }
      }
    }
    if (looseBullets.length) doc.push(bulletList(looseBullets.splice(0)));
  }

  return doc.toString();
}

/**
 * Build the Markdown resume string from a Markdown CV string.
 * @param {string} markdown - cv.md-style Markdown.
 * @returns {string} A clean, markdownlint-compliant Markdown resume.
 */
export function buildCvMarkdown(markdown) {
  return renderMarkdown(parseCvMarkdown(markdown));
}
