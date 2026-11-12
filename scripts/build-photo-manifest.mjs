/*
 * Rebuilds docs/photos/manifest.json from the images in docs/photos/.
 *
 * The photo widget reads the list of pictures from that file, and GitHub
 * Pages cannot serve a directory index, so the list has to exist. Writing it
 * by hand is the boring part of adding a picture, so CI runs this script
 * before publishing and the file is always in sync with the folder.
 *
 *   node scripts/build-photo-manifest.mjs
 */

import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHOTO_DIR = join(ROOT, 'docs', 'photos');
const MANIFEST = join(PHOTO_DIR, 'manifest.json');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.avif'];

function isImage(name) {
  return IMAGE_EXTENSIONS.indexOf(extname(name).toLowerCase()) !== -1;
}

/* Numbers inside a file name sort numerically, so 2.jpg comes before 10.jpg. */
function byName(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

const files = readdirSync(PHOTO_DIR)
  .filter(function (name) {
    return name.charAt(0) !== '.' && isImage(name);
  })
  .sort(byName);

const body = JSON.stringify(files, null, 2) + '\n';
writeFileSync(MANIFEST, body, 'utf8');

process.stdout.write('manifest.json now lists ' + files.length + ' image(s).\n');