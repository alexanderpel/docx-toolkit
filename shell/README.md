# shell — iframe-embeddable docx editor

This application is an independent AGPL-licensed program designed to operate standalone or when embedded via iframe. It is not a component of any proprietary codebase.

It is one of two apps in the [docx-toolkit](..) repository. The sibling [`converter/`](../converter) service is a separate independent program; the shell does not import from it.

It wraps [SuperDoc](https://github.com/Harbour-Enterprises/SuperDoc) (AGPL-3.0) to provide a collaborative `.docx` editor that communicates with a host page over `postMessage`. The host page supplies credentials, the document identifier, and a REST/WebSocket backend; the shell handles the editor lifecycle, real-time collaboration via Y.js + Hocuspocus, presence, and document export.

## License

AGPL-3.0-or-later. See the [LICENSE](../LICENSE) at the repo root for the full text.

If you run a modified version of this software on a public server, AGPL §13 requires that you offer your users the corresponding source code. The visible **Source** link in the UI footer satisfies this requirement.

This project uses the SuperDoc name nominatively to describe its dependency. It is not affiliated with or endorsed by Harbour Enterprises.

## Running standalone

The shell ships with a demo mode that boots against in-memory mock data — no backend required.

```bash
npm install
npm run dev
# open http://localhost:5174/?demo=1
```

## Running embedded

```html
<iframe
  src="https://your-shell-host.example.com/edit/abc123"
  allow="clipboard-read; clipboard-write"
/>
```

The parent page must `postMessage` an `init` payload as soon as the shell sends `ready`. See [src/bridge/types.ts](./src/bridge/types.ts) for the full protocol.

## Routes

- `/edit/:documentId` — collaborative editor.
- `/preview/:documentId` — read-only preview.
- `/?demo=1` — standalone demo against mock APIs.

## Architecture

```
parent page  ──postMessage──▶  shell iframe ──WebSocket──▶  Hocuspocus
                  ▲                  │
                  │                  └──HTTPS──▶  REST backend
                  └──awareness/save events
```

The shell never reads from `localStorage`/`sessionStorage` belonging to the parent and never imports parent code. Its only inputs are postMessage events and HTTP/WebSocket traffic to the URLs supplied at `init` time.

## Source

The full source for this application is at <https://github.com/alexanderpel/docx-toolkit>. AGPL §13 disclosure.
