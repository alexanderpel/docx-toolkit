# docx-toolkit

A small collection of **independent AGPL-licensed programs** that exist alongside (but are not part of) any proprietary host application. Each subdirectory here is its own program — runnable on its own, deployable on its own, and licensed under AGPL-3.0-or-later via the [LICENSE](./LICENSE) at this repo root.

> The programs in this repository are not components of any proprietary codebase. They are designed to operate standalone, or to be invoked over network protocols (HTTP, postMessage) by any host that wishes to use them.

## Apps

| Path | What it is | Network surface |
|---|---|---|
| [`shell/`](./shell) | Iframe-embeddable docx editor built on SuperDoc. Hosts embed it via `<iframe>` and speak to it via `postMessage`. | Browser iframe + postMessage |
| [`converter/`](./converter) | Headless HTTP service that converts an uploaded `.docx` blob into ProseMirror JSON. | `POST /convert` over HTTPS |
| [`ai/`](./ai) | Headless HTTP service that runs SuperDoc intent tools against a live `docx:<id>` Hocuspocus room and returns the result + an inverse-op for undo. Designed to be invoked server-to-server by an AI agent runner. | `POST /apply-tool` over HTTPS |

Each app has its own `README.md` and its own `package.json`, and is independently deployable.

## Independence invariants

These conditions hold for every app under this repo and must continue to hold:

1. **No cross-app runtime imports.** `shell/`, `converter/`, and `ai/` do not import from each other. Each is built and shipped on its own.
2. **Standalone operability.** Every app can be exercised against mock inputs without any other app present (the shell has `?demo=1`, the converter exposes a smoke-test endpoint, the ai service exposes `GET /healthz`).
3. **AGPL coverage.** The single [LICENSE](./LICENSE) at this repo root governs everything in the repo. Each app's `package.json` repeats `"license": "AGPL-3.0-or-later"` for clarity.

If you embed or call any of these programs from a closed-source host, the AGPL terms attach to **the embedded program**, not to your host — provided you communicate with it strictly over a network boundary (postMessage or HTTP) and do not import its source into your host.

## License

[AGPL-3.0-or-later](./LICENSE).

If you run a modified version of any program in this repo on a public server, AGPL §13 requires that you offer your users the corresponding source. Each app's UI / response surfaces a `Source` link to this repository as part of that disclosure.

## Trademark note

The programs here use the SuperDoc name nominatively to describe a dependency. This repository is not affiliated with or endorsed by Harbour Enterprises.
