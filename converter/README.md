# converter — docx → ProseMirror JSON HTTP service

This application is an independent AGPL-licensed program. It is not a component of any proprietary codebase.

It is one of two apps in the [docx-toolkit](..) repository. The sibling [`shell/`](../shell) iframe editor is a separate independent program; the converter does not import from it.

## What it does

Receives a base64-encoded `.docx` payload, runs [SuperDoc](https://github.com/Harbour-Enterprises/SuperDoc)'s headless editor against it, and returns:

- `json` — ProseMirror JSON of the document body
- `styleAlignments` — resolved `styleId → paragraph alignment` map extracted from `word/styles.xml` (handles `<w:basedOn>` inheritance)
- `images` — `docxPath → base64` of media embedded in the docx
- `footnotes` — `footnoteId → plain text` from `word/footnotes.xml`

Any host that wants to import `.docx` content into a ProseMirror-based editor can call this service. The translation from this output into a host-specific schema is the **caller's** responsibility.

## API

### `GET /healthz`

```json
{ "ok": true }
```

### `POST /convert`

Request:
```json
{ "base64Raw": "<base64-encoded docx bytes>" }
```

Headers (optional, but required if `CONVERTER_SHARED_SECRET` is set):
- `X-Converter-Secret: <secret>`

Response:
```json
{
  "json": { "type": "doc", "content": [/* ... */] },
  "styleAlignments": { "Heading1": "center", "Title": "center" },
  "images": { "word/media/image1.png": "iVBORw0KGgo..." },
  "footnotes": { "1": "Note text", "2": "Another note" }
}
```

## Running standalone

```bash
npm install
npm --workspace converter run dev
# in another shell:
curl -X POST http://localhost:5175/convert \
  -H "Content-Type: application/json" \
  -d "{\"base64Raw\":\"$(base64 -i sample.docx | tr -d '\n')\"}"
```

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `5175` | Port the HTTP server listens on |
| `CONVERTER_SHARED_SECRET` | _(unset)_ | If set, requests must present this value in `X-Converter-Secret` |
| `CONVERTER_ALLOWED_ORIGIN` | `*` | CORS Access-Control-Allow-Origin |
| `CONVERTER_BODY_LIMIT_MB` | `50` | Max raw docx size accepted (JSON body is sized to fit base64 inflation) |

## License

AGPL-3.0-or-later. See the [LICENSE](../LICENSE) at the repo root for the full text.

If you run a modified version of this service on a public network, AGPL §13 requires that you offer your users the corresponding source. The `/` and `/healthz` responses surface a `Source` URL to this repository for that disclosure.

## Trademark note

This service uses the SuperDoc name nominatively to describe its dependency. It is not affiliated with or endorsed by Harbour Enterprises.
