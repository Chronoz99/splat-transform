import alias from '@rollup/plugin-alias';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

// Node.js CLI build
const nodeApplication = {
    input: 'src/index.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true,
        entryFileNames: '[name].mjs'
    },
    external: ['webgpu'],
    plugins: [
        typescript({ tsconfig: './tsconfig.json' }),
        resolve(),
        json()
    ],
    cache: false
};

// Browser library build (ESM)
const browserEsm = {
    input: 'src/browser.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true,
        entryFileNames: 'browser.mjs',
        chunkFileNames: 'browser-[name].mjs'
    },
    plugins: [
        alias({
            entries: [
                // Use browser-specific I/O implementations
                { find: './io/data-source', replacement: './io/browser-data-source' },
                { find: '../io/data-source', replacement: '../io/browser-data-source' },
                { find: './io/data-sink', replacement: './io/browser-data-sink' },
                { find: '../io/data-sink', replacement: '../io/browser-data-sink' },
                // Use browser-specific GPU
                { find: './gpu/node-gpu', replacement: './gpu/browser-gpu' },
                { find: '../gpu/node-gpu', replacement: '../gpu/browser-gpu' }
            ]
        }),
        typescript({
            tsconfig: './tsconfig.json',
            declaration: true,
            declarationDir: 'dist/types'
        }),
        resolve({
            browser: true,
            preferBuiltins: false
        }),
        json()
    ],
    // Treat Node.js built-in modules as external (they will fail at runtime if used)
    external: (id) => {
        return id.startsWith('node:') || id === 'webgpu';
    },
    cache: false
};

export default [
    nodeApplication,
    browserEsm
];
