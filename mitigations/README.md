# Mitigations

Two independent fixes for the failure mode described in the [root README](../README.md).
Either one breaks the chain; applying both means a build-config regression can't
silently reintroduce the leak.

| File | Layer | Blocks |
|---|---|---|
| [`vite.config.example.mts`](vite.config.example.mts) | build | condition 1 — the file is never globbed, so it never runs in Window |
| [`guarded_worker.js`](guarded_worker.js) | runtime | condition 2 — the handler refuses to install outside a worker |

## Checking the build-side fix

After building with `.mjs` chunk naming, your plugin should contribute exactly
one entry to the extension list:

```bash
curl -s localhost:8188/extensions | grep <your-plugin-name>
# /extensions/<your-plugin-name>/main.js      <- and nothing else
```

If any other path appears, that file is being executed in the page.

## Checking the runtime-side fix

Load the page and look for the handler. With the guard in place,
`self.onmessage` stays null in `Window`:

```js
// in the page console, after your extension has loaded
self.onmessage   // null
```

Inside a real worker the same module installs the handler normally, so behaviour
is unchanged where it matters.
