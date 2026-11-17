#!/usr/bin/env node
/**
 * CLI wrapper around `src/saveImport.ts` — prints the potion trials recorded in
 * a Cookie Clicker save, and can emit an import code for the app.
 *
 * The TypeScript module is bundled on the fly with the project's esbuild, so
 * there is exactly one implementation of the decoding rules.
 *
 * Usage:
 *   node tools/extract-trials.mjs <save-file> [--list] [--json <out.json>] [--code <out.txt>]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, '../src/saveImport.ts');

const argv = process.argv.slice(2);
const files = argv.filter(arg => !arg.startsWith('--'));
const flag = name => argv.includes(`--${name}`);
const option = name => {
  const index = argv.indexOf(`--${name}`);
  return index !== -1 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : undefined;
};

const savePath = files[0];
if (!savePath) {
  console.error('usage: node tools/extract-trials.mjs <save-file> [--list] [--json out.json] [--code out.txt]');
  process.exit(2);
}

const built = await build({
  entryPoints: [MODULE_PATH],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  logLevel: 'silent',
});
const code = built.outputFiles[0].text;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
const { importFromSave } = await import(moduleUrl);

const result = importFromSave(readFileSync(savePath, 'utf8'));
if (!result.ok) {
  console.error(`error: ${result.error}`);
  process.exit(1);
}

console.log(`save:       ${savePath}`);
console.log(`tested:     ${result.tested}`);
console.log(`recovered:  ${result.entries.length}`);
console.log(`unresolved: ${result.unclassified}`);
console.log('');
const counts = {};
for (const entry of result.entries) {
  const key = entry.outcome.kind === 'potion' ? entry.outcome.potionId : entry.outcome.mixtureId;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(24)} ${count}`);
}

if (flag('list')) {
  console.log('');
  for (const entry of result.entries) {
    const outcome = entry.outcome.kind === 'potion' ? entry.outcome.potionId : entry.outcome.mixtureId;
    console.log(`  ${entry.reagents.join(',')}  ->  ${outcome}`);
  }
}

if (option('json')) {
  writeFileSync(option('json'), `${JSON.stringify(result.entries, null, 2)}\n`);
  console.log(`\nwrote ${option('json')}`);
}

if (option('code')) {
  const payload = { app: 'potion-class-solver', version: 1, recorded: result.entries };
  writeFileSync(option('code'), `${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')}\n`);
  console.log(`wrote ${option('code')} (${result.entries.length} records, importable into the solver)`);
}
