/*
 * Refreshes docs/data/rss.json.
 *
 * Most RSS feeds do not send CORS headers, so the browser cannot read them
 * directly. This job runs on the server instead and publishes a plain JSON
 * file that the dashboard can fetch.
 *
 *   node scripts/fetch-rss.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'docs', 'data', 'rss.json');

/* config.js is a browser script; evaluate it in a sandbox to read the value. */
function readConfig() {
  const source = readFileSync(join(ROOT, 'docs', 'config.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'config.js' });
  return sandbox.window.DESK_CONFIG || {};
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (match, code) {
      return String.fromCharCode(Number(code));
    })
    .replace(/&amp;/g, '&');
}

function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]*>/g, '')).trim();
}

function pick(block, names) {
  for (let i = 0; i < names.length; i += 1) {
    const match = block.match(
      new RegExp('<' + names[i] + '[^>]*>([\\s\\S]*?)</' + names[i] + '>')
    );
    if (match) {
      return stripTags(match[1]);
    }
  }
  return '';
}

function parseFeed(xml) {
  const entries = [];
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const blocks = items.length
    ? items
    : xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const dateNames = items.length
    ? ['pubDate', 'dc:date', 'published']
    : ['updated', 'published'];

  blocks.forEach(function (block) {
    const title = pick(block, ['title']);
    if (!title) {
      return;
    }
    entries.push({
      title: title,
      published: pick(block, dateNames),
    });
  });

  return entries;
}

async function main() {
  const config = readConfig();
  const settings = config.rss || {};
  const feeds = Array.isArray(settings.feeds) ? settings.feeds : [];

  const collected = [];

  for (const feed of feeds) {
    const url = typeof feed === 'string' ? feed : feed.url;
    const name = typeof feed === 'string' ? url : feed.name || url;
    if (!url) {
      continue;
    }
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'desk-dashboard/1.0' },
      });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      const xml = await response.text();
      const entries = parseFeed(xml);
      entries.forEach(function (entry) {
        collected.push({
          feed: name,
          title: entry.title,
          published: entry.published,
        });
      });
      process.stdout.write('ok   ' + name + ' (' + entries.length + ' items)\n');
    } catch (error) {
      process.stdout.write('fail ' + name + ': ' + error.message + '\n');
    }
  }

  collected.sort(function (a, b) {
    return new Date(b.published || 0) - new Date(a.published || 0);
  });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(
    OUTPUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), feeds: collected }, null, 2) +
      '\n',
    'utf8'
  );
  process.stdout.write('wrote ' + OUTPUT + ' (' + collected.length + ' items)\n');
}

main().catch(function (error) {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});

