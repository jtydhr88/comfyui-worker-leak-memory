/*
 * context_probe.js — harmless proof of the enabling condition.
 *
 * This file is NOT an extension entry point. It is a plain helper that happens
 * to sit under WEB_DIRECTORY with a .js extension. ComfyUI's /extensions route
 * globs '**\/*.js' recursively and the frontend imports every result as a page
 * module, so this executes in Window whether or not anyone asked for it.
 *
 * It only records where it ran. No side effects beyond a global marker.
 */

const inWorker =
  typeof DedicatedWorkerGlobalScope === 'function' &&
  self instanceof DedicatedWorkerGlobalScope

const record = {
  file: 'context_probe.js',
  ranIn: inWorker ? 'DedicatedWorker' : 'Window',
  selfIsWindow: typeof window !== 'undefined' && self === window,
  at: new Date().toISOString(),
}

globalThis.__workerLeakProbe = record

console.warn(
  '[worker-leak-demo] context_probe.js executed in %s (self === window: %s). ' +
    'This file was never referenced by the extension entry point.',
  record.ranIn,
  record.selfIsWindow,
)
