/*
 * Static check for features that iOS 12 Safari cannot parse.
 *
 * Only scans docs/, because scripts/ runs in Node during CI and may use
 * anything Node supports.
 *
 *   node scripts/check-compat.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'docs');

const JS_BANNED = [
  [/\?\.[A-Za-z_$[(]/, 'optional chaining (Safari 13.1)'],
  [/\?\?/, 'nullish coalescing (Safari 13.1)'],
  [/\.replaceAll\(/, 'String.replaceAll (Safari 13.1)'],
  [/Object\.fromEntries/, 'Object.fromEntries (Safari 12.1)'],
  [/\bglobalThis\b/, 'globalThis (Safari 12.1)'],
  [/AbortController/, 'AbortController (Safari 12.1)'],
  [/IntersectionObserver/, 'IntersectionObserver (Safari 12.1)'],
  [/ResizeObserver/, 'ResizeObserver (Safari 13.1)'],
  [/Promise\.allSettled/, 'Promise.allSettled (Safari 13)'],
  [/\bstructuredClone\b/, 'structuredClone (Safari 15.4)'],
  [/\.at\(-/, 'Array.at / String.at (Safari 15.4)'],
  [/\bBigInt\b/, 'BigInt (Safari 14)'],
];

const CSS_BANNED = [
  [/(^|[;{\s])gap\s*:/, 'flex gap (Safari 14.1)'],
  [/(^|[;{\s])inset\s*:/, 'inset (Safari 14.1)'],
  [/\bclamp\(/, 'clamp() (Safari 13.1)'],
  [/aspect-ratio\s*:/, 'aspect-ratio (Safari 15)'],
  [/:is\(|:where\(/, ':is() / :where() (Safari 14)'],
  [/\d(dvh|svh|lvh)\b/, 'dvh / svh / lvh (Safari 15.4)'],
  [/(^|[^-])backdrop-filter\s*:/, 'backdrop-filter without the -webkit- prefix'],
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (['.js', '.css', '.html'].includes(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

/* Strip comments so that prose mentioning a banned feature is not flagged. */
function stripComments(text, isCss) {
  if (isCss) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '');
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const files = walk(TARGET, []);
const problems = [];

files.forEach(function (file) {
  const isCss = extname(file) === '.css';
  const text = stripComments(readFileSync(file, 'utf8'), isCss);
  text.split('\n').forEach(function (line, index) {
    const rules = isCss ? CSS_BANNED : JS_BANNED;
    rules.forEach(function (rule) {
      if (rule[0].test(line)) {
        problems.push({
          file: relative(ROOT, file),
          line: index + 1,
          label: rule[1],
          text: line.trim(),
        });
      }
    });
  });
});

problems.forEach(function (problem) {
  process.stdout.write(
    problem.file + ':' + problem.line + '  ' + problem.label + '\n    ' + problem.text + '\n'
  );
});

if (!problems.length) {
  process.stdout.write('PASS: ' + files.length + ' files are iOS 12 safe\n');
} else {
  process.stdout.write('FOUND ' + problems.length + ' issue(s)\n');
  process.exit(1);
}

