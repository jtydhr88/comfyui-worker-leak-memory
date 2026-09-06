/*
 * leak_worker.js — an ordinary Web Worker skeleton.
 *
 * There is nothing unusual about this file. It is the shape almost every
 * worker takes: install `self.onmessage`, reply with `self.postMessage`.
 * In a DedicatedWorker that is correct — postMessage sends to the host page.
 *
 * In Window, `self === window`, so postMessage delivers to the very global
 * that has the onmessage handler installed. Each message produces a reply
 * that is itself a message. That is the leak.
 *
 * SAFETY: the handler is installed only when armed from the demo panel, so
 * merely installing this plugin does nothing. Real-world workers have no such
 * guard, because their authors never expected Window execution.
 */

const state = { messages: 0, installed: false, mode: null }
globalThis.__workerLeakState = state

function reply(payload) {
  // The single line that behaves completely differently depending on scope.
  self.postMessage(payload)
}

function onMessage(event) {
  const msg = event && event.data
  if (!msg || msg.__demo !== true) return

  state.messages += 1

  if (state.mode === 'bounded' && state.messages >= 5000) {
    console.warn('[worker-leak-demo] bounded mode reached 5000 messages, stopping')
    stopDemo()
    return
  }

  // A worker answering a request. Retained payload makes the growth visible;
  // a self-feeding loop leaks regardless of payload size.
  reply({
    __demo: true,
    reqId: msg.reqId + 1,
    ballast: new Uint8Array(4096),
  })
}

export function armDemo(mode = 'bounded') {
  if (state.installed) return state
  state.mode = mode
  state.installed = true
  self.onmessage = onMessage
  console.warn(
    '[worker-leak-demo] handler installed in %s (mode: %s)',
    self === globalThis.window ? 'Window' : 'Worker',
    mode,
  )
  return state
}

export function fireDemo() {
  if (!state.installed) throw new Error('arm the demo first')
  self.postMessage({ __demo: true, reqId: 0, ballast: new Uint8Array(4096) })
}

export function stopDemo() {
  self.onmessage = null
  state.installed = false
  state.mode = null
  console.warn('[worker-leak-demo] handler removed after %d messages', state.messages)
  return state
}

export function demoState() {
  return { ...state }
}
