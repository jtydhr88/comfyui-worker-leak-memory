/*
 * main.js — the only file in this plugin that is meant to be an extension
 * entry point. Everything else under js/ is imported by ComfyUI anyway.
 *
 * Adds a small panel to arm, fire and stop the demonstration, and to read the
 * context probe's verdict.
 */

import { app } from '../../scripts/app.js'
import { armDemo, fireDemo, stopDemo, demoState } from './leak_worker.js'

const PANEL_ID = 'worker-leak-demo-panel'

function fmtBytes(n) {
  if (!Number.isFinite(n)) return 'n/a'
  return (n / 1048576).toFixed(1) + ' MB'
}

function heap() {
  const m = performance && performance.memory
  return m ? m.usedJSHeapSize : NaN
}

function buildPanel() {
  if (document.getElementById(PANEL_ID)) return

  const box = document.createElement('div')
  box.id = PANEL_ID
  box.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:99999',
    'width:320px', 'padding:12px 14px', 'border-radius:8px',
    'background:#1b1b1f', 'color:#e6e6e6', 'font:12px/1.5 system-ui,sans-serif',
    'box-shadow:0 6px 24px rgba(0,0,0,.45)', 'border:1px solid #33343a',
  ].join(';')

  const probe = globalThis.__workerLeakProbe
  box.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">ComfyUI worker-leak demo</div>
    <div style="opacity:.75;margin-bottom:8px">
      context_probe.js ran in:
      <b style="color:${probe && probe.ranIn === 'Window' ? '#ff8f6b' : '#7bd88f'}">
        ${probe ? probe.ranIn : 'not loaded'}
      </b>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      <button data-act="bounded">Arm (bounded, 5k)</button>
      <button data-act="unbounded">Arm (unbounded)</button>
      <button data-act="fire">Fire</button>
      <button data-act="stop">Stop</button>
    </div>
    <div data-out style="font-family:ui-monospace,monospace;white-space:pre-wrap"></div>
  `

  for (const b of box.querySelectorAll('button')) {
    b.style.cssText =
      'padding:4px 8px;border-radius:5px;border:1px solid #44454c;' +
      'background:#26272c;color:#e6e6e6;cursor:pointer;font:11px system-ui'
  }

  const out = box.querySelector('[data-out]')
  const baseline = heap()
  let timer = null

  function render() {
    const s = demoState()
    out.textContent =
      `messages : ${s.messages}\n` +
      `installed: ${s.installed} (${s.mode || '-'})\n` +
      `heap     : ${fmtBytes(heap())}  (+${fmtBytes(heap() - baseline)})`
  }

  box.addEventListener('click', (e) => {
    const act = e.target && e.target.dataset && e.target.dataset.act
    if (!act) return
    try {
      if (act === 'bounded' || act === 'unbounded') {
        armDemo(act)
        if (!timer) timer = setInterval(render, 250)
      } else if (act === 'fire') {
        fireDemo()
      } else if (act === 'stop') {
        stopDemo()
        if (timer) { clearInterval(timer); timer = null }
      }
    } catch (err) {
      out.textContent = String(err && err.message ? err.message : err)
      return
    }
    render()
  })

  document.body.appendChild(box)
  render()
}

app.registerExtension({
  name: 'workerleak.demo',
  async setup() {
    buildPanel()
  },
})
