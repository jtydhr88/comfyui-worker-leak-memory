/*
 * guarded_worker.js — the runtime-side mitigation.
 *
 * Identical to a normal worker except for the final guard: the message handler
 * is installed only in a DedicatedWorker. If ComfyUI imports this file into the
 * page, it defines its functions and does nothing else.
 */

function onMessage(event) {
  const msg = event && event.data
  if (!msg) return

  // ... real work here ...

  self.postMessage({ reqId: msg.reqId, ok: true })
}

// The guard. Without it, `self.postMessage` above delivers to the same global
// that this handler is attached to, and every reply becomes a new request.
const WorkerScope = globalThis.DedicatedWorkerGlobalScope
if (typeof WorkerScope === 'function' && self instanceof WorkerScope) {
  self.onmessage = onMessage
}
