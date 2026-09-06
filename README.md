# comfyui-worker-leak-memory

A minimal, opt-in reproduction of a ComfyUI extension-loading failure mode:
**every `.js` file under a custom node's `WEB_DIRECTORY` is imported into the
page**, including Web Worker scripts that were never meant to run there. A
worker that is written the ordinary way becomes a self-feeding message loop in
`Window`, and the tab consumes memory until it dies.

Installing this plugin is safe. Nothing loops on load; the demonstration must be
armed explicitly from a panel.

---

## TL;DR

ComfyUI serves an extension's frontend by globbing its web directory
recursively and handing the whole list to the browser, which imports each entry
as a page module:

```python
# server.py, /extensions route
files = glob.glob(os.path.join(glob.escape(dir), '**/*.js'), recursive=True)
```

There is no notion of an *entry point*. A file is imported because it exists and
ends in `.js`.

A Web Worker's standard skeleton is:

```js
self.onmessage = handle          // receive from the host
self.postMessage(reply)          // send to the host
```

In a `DedicatedWorker` that is correct. In `Window`, `self === window`, so
`postMessage` delivers **to the same global that has the `onmessage` handler
installed**. One message produces a reply, which is another message, which
produces another reply. Memory climbs until the tab is unusable.

Neither half is unusual. The bug only exists where they meet.

## The two conditions

| # | Condition | Owner |
|---|---|---|
| 1 | A non-entry-point `.js` file sits under `WEB_DIRECTORY` and is executed in `Window` | ComfyUI |
| 2 | That file's code self-feeds when `self === window` | the plugin |

Condition 1 alone is harmless-but-wrong: the script runs somewhere it was never
designed to run. Condition 2 alone is fine: a worker in a real worker behaves.
Together they exhaust memory.

## Why this is not an exotic mistake

Bundlers emit worker chunks as `.js` by default. Vite's `worker.rollupOptions`,
webpack's `worker-loader`, and esbuild all produce `worker-<hash>.js` unless you
override the naming. So the default output of the standard toolchain, dropped
into the standard plugin layout, satisfies condition 1 without anyone making a
decision. Condition 2 is satisfied by the standard worker skeleton.

The consequence differs by code shape:

- **Self-feeding worker** (`onmessage` + `postMessage` on the same global) —
  unbounded memory growth once the first message is sent.
- **Non-looping helper** — executes once in the page. Usually harmless, but it
  runs with full page privileges and can register listeners, patch globals or
  perform side effects its author never scoped to the page.

## Measured

Both conditions verified on the environment listed at the bottom of this file.

**Condition 1** — the glob runs per request, so any `.js` dropped into an
already-registered web directory is served immediately, no restart involved:

```
$ echo "// temp" > ComfyUI/custom_nodes/<plugin>/js/__probe.js
$ curl -s localhost:8188/extensions | grep __probe
/extensions/<plugin>/__probe.js          <- listed, and therefore imported

$ rm ComfyUI/custom_nodes/<plugin>/js/__probe.js
$ curl -s localhost:8188/extensions | grep __probe
                                          <- gone
```

**Condition 2** — one seed `postMessage` in `Window`, with a 4 KB payload
retained per message, capped at 3,000 to keep the tab alive:

| | |
|---|---|
| messages from a single seed | 3,000 |
| elapsed | 0.10 s |
| rate | **31,250 messages/second** |
| heap retained | 21.6 MB |
| per 1,000 messages | **7.2 MB** |

That is roughly **225 MB/second** of retained heap, which reaches the ~13 GB of
the original incident in about a minute — with the main thread saturated the
whole time, since every iteration runs on it.

Worth noting for the runtime mitigation: `typeof DedicatedWorkerGlobalScope` is
`"undefined"` in `Window` and `"function"` in a worker, which is exactly why the
`self instanceof WorkerScope` guard is safe to write as a plain `typeof` check.

## Reproduce

1. Clone into `ComfyUI/custom_nodes/`:

   ```bash
   cd ComfyUI/custom_nodes
   git clone <this repo> comfyui-worker-leak-memory
   ```

2. Restart ComfyUI and open the UI. A panel appears in the bottom-right.

3. Confirm condition 1 without arming anything. The panel shows where
   `context_probe.js` executed, and the console carries:

   ```
   [worker-leak-demo] context_probe.js executed in Window (self === window: true).
   This file was never referenced by the extension entry point.
   ```

   `context_probe.js` is imported by nothing. It runs because ComfyUI globbed it.
   You can also see it listed directly:

   ```bash
   curl -s localhost:8188/extensions | grep worker-leak
   # /extensions/comfyui-worker-leak-memory/context_probe.js
   # /extensions/comfyui-worker-leak-memory/leak_worker.js
   # /extensions/comfyui-worker-leak-memory/main.js
   ```

   All three are imported into the page. Only `main.js` was ever intended to be.

4. Arm and fire. **Start with bounded mode**, which stops itself after 5,000
   messages. Watch `messages` and `heap` climb in the panel.

5. `Unbounded` reproduces the real incident shape. It will not stop on its own —
   use `Stop`, or close the tab. Do not run it on a machine you care about
   keeping responsive.

### What to record for a report

- `performance.memory.usedJSHeapSize` growth per 1,000 messages (the panel shows
  the delta from load).
- Renderer process RSS and CPU from the OS, not just the tab — a self-feeding
  loop saturates the main thread.
- The `/extensions` listing, which is the primary evidence for condition 1.

## Mitigations

Both are plugin-side. They are independent, and either one alone breaks the
chain — which is why it is worth having both.

### 1. Build side — keep worker chunks out of the glob

The glob matches `*.js` only. Emitting worker and chunk assets as `.mjs` makes
them invisible to `/extensions` while remaining perfectly importable by your own
entry point:

```ts
// vite.config.mts
export default defineConfig({
  worker: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].mjs',
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',              // the one real entry point
        chunkFileNames: 'assets/[name]-[hash].mjs',
      },
    },
  },
})
```

After this, `/extensions` returns exactly one path for your plugin.

### 2. Runtime side — refuse to install the handler outside a worker

```js
const WorkerScope = globalThis.DedicatedWorkerGlobalScope
if (typeof WorkerScope === 'function' && self instanceof WorkerScope) {
  self.onmessage = onMessage
}
```

Cheap, and it survives a build config that later regresses. See
[`mitigations/`](mitigations/) for both applied to this repo's worker.

## Suggested upstream direction

The plugin-side fixes work, but every plugin has to discover this
independently — and the failure is silent until someone's tab hits 13 GB. Some
options for ComfyUI itself, roughly in order of how invasive they are:

1. **Let plugins declare their entry points** instead of globbing the tree — for
   example an optional manifest, or honouring `WEB_ENTRY = "main.js"` when the
   plugin defines it, falling back to the current glob when it doesn't. This is
   backwards compatible and removes the whole class.
2. **Exclude obvious worker output** from the glob (`*worker*.js`,
   `assets/**`), which is a heuristic but costs nothing.
3. **Warn on import** when a globbed module has no `registerExtension` call —
   surfaces both this bug and dead files, without changing behaviour.

## A real instance

This pattern was found in the wild in
[ComfyTV](https://github.com/jtydhr88/ComfyTV) / pentrado, where an OPFS tile
swap worker (`swapWorker.ts`) was emitted as `.js` under the served directory.
Once imported into `Window`, its `self.postMessage` replies fed its own
`self.onmessage`; the reported incident showed the browser at roughly 13 GB RSS
with the renderer pegged at several hundred percent CPU. Fixed in
[ComfyTV#429](https://github.com/jtydhr88/ComfyTV/pull/429), which applied both
mitigations above — `.mjs` chunk naming plus a `DedicatedWorkerGlobalScope`
guard.

That project is now clean: `/extensions` returns only its single `main.js`,
while 20 `.mjs` chunks under `js/assets/` are loaded by the entry point itself
and never by ComfyUI.

## Safety

- The leak is opt-in. Installing this plugin does not start anything.
- `context_probe.js` only records where it ran and sets one global.
- Bounded mode caps at 5,000 messages. Unbounded mode is provided because the
  unbounded case is the one worth showing, and it is labelled as such.
- Nothing here touches the network, the filesystem, or any ComfyUI state.

## Verified against

| | |
|---|---|
| ComfyUI | 0.34.0 (`250b2e95`) |
| Frontend | 1.51.9 |
| Glob site | `server.py:359` (core extensions), `server.py:364` (custom node web dirs) |
| Python | 3.12.3, Linux |

## License

MIT — see [LICENSE](LICENSE).
