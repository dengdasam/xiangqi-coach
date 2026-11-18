import { build } from 'esbuild';
const r = await build({ entryPoints: ['src/chess/rules.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const code = r.outputFiles[0].text;
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const results = mod.runPerftSelfTest();
console.log(JSON.stringify(results, null, 2));
console.log('ALL_OK=' + results.every(x => x.ok));
