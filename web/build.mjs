import { build } from 'esbuild';
import { copyFile, cp, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['web/files.mjs', 'web/pdf-output.mjs'],
    bundle: true,
    splitting: true,
    format: 'esm',
    target: 'es2022',
    outdir: 'dist',
    chunkNames: 'chunks/[name]-[hash]',
    external: ['fs', 'path']
  }),
  ...[
    ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
    ['occt-import-js/dist/occt-import-js.js', 'occt-import-js.js'],
    ['occt-import-js/dist/occt-import-js.wasm', 'occt-import-js.wasm']
  ].map(([source, target]) => copyFile('node_modules/' + source, 'dist/' + target)),
  cp('node_modules/pdfjs-dist/cmaps', 'dist/cmaps', { recursive: true }),
  cp('node_modules/pdfjs-dist/standard_fonts', 'dist/standard_fonts', { recursive: true }),
  copyFile('web/step-worker.js', 'dist/step-worker.js'),
  copyFile('web/workflow.js', 'dist/workflow.js')
]);
