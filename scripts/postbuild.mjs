// Ship the commander augmentation once and reference it from both .d.mts and .d.cts,
// so mixed ESM/CJS TypeScript projects don't get a duplicated augmentation.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
copyFileSync('types/commander-augment.d.ts', 'dist/commander-augment.d.ts');
for (const f of ['dist/index.d.mts', 'dist/index.d.cts']) {
  let s = readFileSync(f, 'utf8').replace(/\/\/\/ <reference path="[^"]*commander-augment\.d\.ts" \/>\n?/g, '');
  if (s.includes("declare module 'commander'")) throw new Error(`${f}: inline augmentation leaked`);
  writeFileSync(f, '/// <reference path="./commander-augment.d.ts" />\n' + s);
}
