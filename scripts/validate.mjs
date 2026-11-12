import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const required = [
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/app.js',
  'js/api.js',
  'workers/hamsat-api.js',
  'assets/hamsat-hero.svg'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required file: ${file}`);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons)) {
    errors.push('manifest.json is missing required PWA fields');
  }
  for (const icon of manifest.icons || []) {
    if (icon.src && !fs.existsSync(path.join(root, icon.src))) {
      errors.push(`Missing PWA icon: ${icon.src}`);
    }
  }
} catch (error) {
  errors.push(`Invalid manifest.json: ${error.message}`);
}

let html = '';
try {
  html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
} catch {}
const localRefs = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)]
  .map(match => match[1])
  .filter(ref => !/^(?:https?:|data:|\/\/|mailto:|tel:|javascript:)/i.test(ref));
for (const ref of localRefs) {
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  if (clean && !fs.existsSync(path.join(root, clean))) errors.push(`Broken local reference in index.html: ${ref}`);
}

for (const file of ['js/app.js', 'js/api.js', 'workers/hamsat-api.js']) {
  if (!fs.existsSync(path.join(root, file))) continue;
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) errors.push(`JavaScript syntax error in ${file}: ${check.stderr || check.stdout}`);
}

if (errors.length) {
  console.error('Hamsat validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Hamsat validation passed: required files, PWA manifest, local references, and JavaScript syntax.');
