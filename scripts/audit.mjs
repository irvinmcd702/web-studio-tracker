#!/usr/bin/env node
/**
 * Checks for things the interface claims that the server does not do.
 *
 * Every one of these came from a bug that reached production: a Workflow
 * dropdown on the project settings page that changed, saved, said "Saved",
 * and did nothing, because `updateProjectAction` had never read that field.
 * Nothing was broken — the field had simply outlived its handler, and no test
 * could see it, because both halves were correct on their own.
 *
 * The checks are deliberately structural rather than clever. They read the
 * source, not the running app, so they cost nothing and can run before a
 * release:
 *
 *   1. a form field no action reads
 *   2. a stored switch nothing consults
 *   3. a link with no route behind it
 *
 * Precision matters more than reach here. An audit that cries wolf is an
 * audit nobody runs twice, so this attributes fields to the individual form
 * they sit in rather than to the file — a file often holds three forms, and
 * a field belonging to one of them is not a finding against the others.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const files = [
  ...walk(join(ROOT, "app")),
  ...walk(join(ROOT, "components")),
  ...walk(join(ROOT, "lib")),
];
const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const flat = (t) => t.replace(/\s+/g, " ");

const findings = [];
const note = (check, where, what) => findings.push({ check, where, what });

// ---------------------------------------------------------------------------
// 1. A form field no action reads
// ---------------------------------------------------------------------------

/** Helpers handed the whole formData, which read fields on an action's behalf. */
const helperFields = {};
for (const [file, text] of src) {
  for (const m of flat(text).matchAll(
    /(?:export )?function (\w+)\([^)]*formData[^)]*\)/g,
  )) {
    const after = flat(text).slice(m.index, m.index + 4000);
    helperFields[m[1]] = [
      ...after.matchAll(/formData ?\.get(?:All)?\("([^"]+)"\)/g),
    ].map((x) => x[1]);
  }
}

/** Fields each action reads, following delegation to other actions. */
const reads = {};
const delegates = {};
for (const file of files.filter((f) => /actions[\\/][a-z-]+\.ts$/.test(f))) {
  for (const part of src
    .get(file)
    .split(/export async function /)
    .slice(1)) {
    const name = part.match(/^(\w+)/)?.[1];
    if (!name) continue;
    const body = flat(part);
    reads[name] = new Set(
      [...body.matchAll(/formData ?\.get(?:All)?\("([^"]+)"\)/g)].map(
        (m) => m[1],
      ),
    );
    for (const [helper, fields] of Object.entries(helperFields)) {
      if (new RegExp(`${helper}\\( ?formData`).test(body)) {
        fields.forEach((f) => reads[name].add(f));
      }
    }
    delegates[name] = [...body.matchAll(/(\w+Action)\( ?formData ?\)/g)].map(
      (m) => m[1],
    );
  }
}

function readsOf(name, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const all = new Set(reads[name] ?? []);
  for (const next of delegates[name] ?? []) {
    readsOf(next, seen).forEach((f) => all.add(f));
  }
  return all;
}

/**
 * Every place a form component is used with an action handed to it, and the
 * props that call site passes — because whether a field is even rendered can
 * depend on them.
 */
const callSites = {};
for (const [, text] of src) {
  for (const m of flat(text).matchAll(
    /<([A-Z]\w+)((?:[^>]|>(?!\s*<))*?)action=\{(\w+Action)\}([^>]*)>/g,
  )) {
    (callSites[m[1]] ??= []).push({
      action: m[3],
      props: propsAtCallSite(m[2] + " " + m[4]),
    });
  }
}

/**
 * The fields a form always submits.
 *
 * Two kinds are left out on purpose, because neither can lie:
 *
 * A **disabled** control is not submitted at all, and the interface shows it
 * greyed with a reason — the project key does this.
 *
 * A field inside a JSX conditional is the fix for this very bug: the ticket
 * form only renders its status picker when it is given statuses, and the
 * project form only renders the workflow picker when creating. Those are
 * fields deliberately absent where they would be ignored, which is the
 * opposite of the failure. What is left is a control rendered unconditionally
 * whose value goes nowhere — exactly the shape that shipped.
 */
function fieldsIn(block, switches = {}) {
  const found = [];

  for (const m of block.matchAll(/\bname="([a-zA-Z][a-zA-Z0-9_]*)"/g)) {
    const tagStart = block.lastIndexOf("<", m.index);
    const tagEnd = block.indexOf(">", m.index);
    const tag = block.slice(tagStart, tagEnd < 0 ? block.length : tagEnd);
    if (/\bdisabled\b/.test(tag)) continue;

    // Any enclosing `{ … }` whose head reads as a condition or a loop.
    const open = [];
    let conditional = false;
    for (let i = 0; i < m.index; i++) {
      if (block[i] === "{") open.push(i);
      else if (block[i] === "}") open.pop();
    }
    for (const at of open) {
      const head = block.slice(at, block.indexOf("<", at));
      if (!/\?|&&|\.map\(/.test(head)) continue;

      // `{showWorkflow ? …` — a guard whose whole condition is one prop can be
      // settled from the call site, and has to be. This check exists because a
      // workflow dropdown was rendered where nothing read it; the fix made the
      // field conditional on exactly such a prop, so a rule that waved through
      // every conditional would stop seeing the bug the moment somebody
      // dropped the guard at a call site again.
      const guard = head.match(/^\{\s*(\w+)\s*(?:\?|&&)/)?.[1];
      if (guard && guard in switches) {
        if (switches[guard] === true) continue; // guard is on: the field renders
        conditional = true;
        break;
      }

      conditional = true;
      break;
    }
    if (!conditional) found.push(m[1]);
  }

  return found;
}

/** `showWorkflow = true` in the destructured props. */
function propDefaults(text) {
  const defaults = {};
  for (const m of text.matchAll(/\b(\w+) = (true|false),/g)) {
    defaults[m[1]] = m[2] === "true";
  }
  return defaults;
}

/** What one call site passes: `showWorkflow={false}`, or bare, or nothing. */
function propsAtCallSite(tag) {
  const passed = {};
  for (const m of tag.matchAll(/(\w+)=\{(true|false)\}/g)) {
    passed[m[1]] = m[2] === "true";
  }
  for (const m of tag.matchAll(/(?:^|\s)(\w+)(?=\s|\/|>)/g)) {
    if (!(m[1] in passed) && /^(show|allow|is|can|with)[A-Z]/.test(m[1])) {
      passed[m[1]] = true;
    }
  }
  return passed;
}

/**
 * Each <form> in a file, with the action bound to it and the fields inside.
 *
 * Scoped per component, not per file. Three components in one file each write
 * `const [state, action] = useActionState(…)`, so a file-wide map of local
 * names keeps only the last and blames one action for every form in the file.
 */
function formsIn(whole) {
  return splitComponents(whole).flatMap(formsInComponent);
}

function splitComponents(text) {
  const starts = [...text.matchAll(/export function \w+/g)].map((m) => m.index);
  if (starts.length === 0) return [text];
  return starts.map((start, i) =>
    text.slice(start, starts[i + 1] ?? text.length),
  );
}

function formsInComponent(text) {
  // `const [state, submit] = useActionState(fooAction, …)` — the local name is
  // what the form actually references.
  const locals = {};
  for (const m of text.matchAll(
    /const \[\s*\w+\s*,\s*(\w+)\s*\]\s*=\s*useActionState\(\s*(\w+)/g,
  )) {
    locals[m[1]] = m[2];
  }

  const forms = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf("<form", from);
    if (start < 0) break;
    const end = text.indexOf("</form>", start);
    const block = text.slice(start, end < 0 ? text.length : end);
    from = start + 5;

    const bound = block.match(/action=\{(\w+)\}/)?.[1] ?? null;
    const resolved = bound ? (locals[bound] ?? bound) : null;
    forms.push({
      // A form wired to a named action here; or one waiting for whatever a
      // call site hands it, whose fields cannot be settled until we know.
      action: reads[resolved] ? resolved : null,
      block,
      defaults: propDefaults(text),
    });
  }
  return forms;
}

for (const [file, text] of src) {
  if (/actions[\\/]/.test(file)) continue;

  const exported = [...text.matchAll(/export function (\w+)/g)].map(
    (m) => m[1],
  );
  const sites = exported.flatMap((name) => callSites[name] ?? []);

  for (const form of formsIn(text)) {
    // A form wired to its own action renders the same fields everywhere. One
    // that takes its action as a prop is a different form at every call site,
    // and has to be judged at each — which is exactly how the workflow
    // dropdown stayed out of sight.
    const cases = form.action
      ? [{ action: form.action, switches: form.defaults }]
      : sites.map((site) => ({
          action: site.action,
          switches: { ...form.defaults, ...site.props },
        }));

    for (const { action, switches } of cases) {
      if (!reads[action]) continue;
      const fields = fieldsIn(form.block, switches);
      if (!fields.length) continue;

      const seen = readsOf(action);
      const ignored = fields.filter((f) => !seen.has(f));
      if (ignored.length) {
        note(
          "field no action reads",
          `${rel(file)} → ${action}`,
          ignored.join(", "),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. A stored switch nothing consults
// ---------------------------------------------------------------------------

const schema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
const flags = [
  ...new Set([...schema.matchAll(/^\s+(\w+)\s+Boolean\s/gm)].map((m) => m[1])),
];

for (const flag of flags) {
  const consulted = files.some((f) => {
    const t = src.get(f);
    if (!t.includes(flag)) return false;
    // The form that offers it and the action that stores it do not count as
    // anybody asking the question.
    if (/components[\\/].*form/i.test(f)) return false;
    if (/actions[\\/]/.test(f)) return false;
    return true;
  });
  if (!consulted) {
    note("switch nothing consults", "prisma/schema.prisma", flag);
  }
}

// ---------------------------------------------------------------------------
// 3. A link with no route behind it
// ---------------------------------------------------------------------------

const all = [...src.values()].join("\n");
const routeExists = (route) => {
  const walkRoute = (dir, rest) => {
    if (rest.length === 0) {
      return ["page.tsx", "route.ts"].some((f) => existsSync(join(dir, f)));
    }
    const [head, ...tail] = rest;
    const literal = join(dir, head);
    if (existsSync(literal) && walkRoute(literal, tail)) return true;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (/^\[.+\]$/.test(entry.name) && walkRoute(full, tail)) return true;
      // Route groups like (app) do not appear in the URL.
      if (/^\(.+\)$/.test(entry.name) && walkRoute(full, rest)) return true;
    }
    return false;
  };
  return walkRoute(join(ROOT, "app"), route.split("/").filter(Boolean));
};

for (const route of new Set(
  [...all.matchAll(/href=["'`](\/[a-zA-Z0-9\-_/]*)["'`]/g)].map((m) => m[1]),
)) {
  if (!routeExists(route)) note("link with no route", "href", route);
}

// ---------------------------------------------------------------------------

if (findings.length === 0) {
  console.log("Nothing the interface claims that the server does not do.");
  process.exit(0);
}

const byCheck = new Map();
for (const f of findings) {
  (byCheck.get(f.check) ?? byCheck.set(f.check, []).get(f.check)).push(f);
}

for (const [check, rows] of byCheck) {
  console.log(`\n${check}:`);
  for (const row of rows) console.log(`  ${row.where}\n    ${row.what}`);
}

console.log(
  `\n${findings.length} finding(s). Each is a promise the interface makes and the server does not keep.`,
);
process.exit(1);
