/*
 * vite.config.example.mts — the build-side mitigation.
 *
 * ComfyUI's /extensions route globs '**\/*.js' under WEB_DIRECTORY and the
 * frontend imports every match as a page module. Emitting worker and chunk
 * assets as .mjs keeps them out of that glob while your own entry point still
 * imports them normally.
 *
 * Result: exactly one .js file (main.js) under the served directory.
 */

import { defineConfig } from 'vite'

export default defineConfig({
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
  build: {
    outDir: 'js',
    rollupOptions: {
      output: {
        // The single file ComfyUI should auto-import.
        entryFileNames: 'main.js',
        // Everything else stays invisible to the glob.
        chunkFileNames: 'assets/[name]-[hash].mjs',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
