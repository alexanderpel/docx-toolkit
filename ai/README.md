# ai — SuperDoc tool execution service

This application is an independent AGPL-licensed program. It is one of three apps in the [docx-toolkit](..) repository (alongside [`shell/`](../shell) and [`converter/`](../converter)). The shell, converter, and ai service are separate independent programs; none imports from the others.

## What it does

Receives `POST /apply-tool { documentId, tool, args }`, joins the Hocuspocus room `docx:<documentId>` as a service collaborator, runs the named SuperDoc intent tool against the live Y.Doc, and returns the tool result plus an inverse operation spec. Edits propagate to all live editors via Hocuspocus CRDT broadcast.

Designed to be invoked server-to-server by an AI agent runner that holds the LLM-side reasoning loop.

## API

### `GET /healthz` → `{ ok: true }`
### `GET /` → `{ name, license, source, description }`
### `POST /apply-tool`

Request headers:
- `Content-Type: application/json`
- `X-AI-Secret: <secret>` (if `AI_SERVICE_SECRET` is set)

Request body:
```json
{ "documentId": "abc-123", "tool": "search", "args": { "query": "Introduction" } }
```

Response:
```json
{ "result": <tool-specific>, "inverseOp": { "tool": "...", "args": { /* ... */ } } | null }
```

## Running standalone

```bash
npm install
npm --workspace ai run dev
# in another shell:
curl http://localhost:5176/healthz
```

## Configuration

See `.env.sample`.

## License

AGPL-3.0-or-later. See [LICENSE](../LICENSE) at the repo root.

## Trademark note

Uses the SuperDoc name nominatively to describe its dependency. Not affiliated with or endorsed by Harbour Enterprises.
