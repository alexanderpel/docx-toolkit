import { JSDOM } from "jsdom";
import { Editor, getStarterExtensions } from "superdoc/super-editor";

// SuperDoc's headless editor parses a .docx into ProseMirror JSON. We
// supplement that with two raw-XML passes the editor doesn't expose:
//   - word/styles.xml → resolved paragraph-alignment-by-styleId (incl. basedOn)
//   - word/footnotes.xml → footnote-id → plain-text content

type DocxFileEntry = { name: string; content: string };

const STYLE_BLOCK_RE = /<w:style[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
const JC_RE = /<w:jc\s+w:val="([^"]+)"/;
const BASED_ON_RE = /<w:basedOn\s+w:val="([^"]+)"/;

const extractStyleAlignments = (entries: DocxFileEntry[]): Record<string, string> => {
  const stylesEntry = entries.find(
    (e) => e.name === "word/styles.xml" || e.name === "word\\styles.xml",
  );
  if (!stylesEntry) return {};

  const xml = stylesEntry.content;
  const directJc: Record<string, string> = {};
  const basedOn: Record<string, string> = {};

  for (const match of xml.matchAll(STYLE_BLOCK_RE)) {
    const styleId = match[1];
    const body = match[2];

    const jcMatch = body.match(JC_RE);
    if (jcMatch) directJc[styleId] = jcMatch[1];

    const boMatch = body.match(BASED_ON_RE);
    if (boMatch) basedOn[styleId] = boMatch[1];
  }

  const resolved: Record<string, string> = {};

  const resolve = (id: string, depth = 0): string | undefined => {
    if (depth > 10) return undefined;
    if (resolved[id]) return resolved[id];
    if (directJc[id]) {
      resolved[id] = directJc[id];
      return directJc[id];
    }
    if (basedOn[id]) {
      const parentJc = resolve(basedOn[id], depth + 1);
      if (parentJc) {
        resolved[id] = parentJc;
        return parentJc;
      }
    }
    return undefined;
  };

  for (const id of new Set([...Object.keys(directJc), ...Object.keys(basedOn)])) {
    resolve(id);
  }

  return resolved;
};

const FOOTNOTE_BLOCK_RE = /<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g;
const FOOTNOTE_ID_RE = /w:id="([^"]+)"/;
const FOOTNOTE_TYPE_RE = /w:type="([^"]+)"/;
const FOOTNOTE_TEXT_RE = /<w:t[^>]*>([^<]*)<\/w:t>/g;

const extractFootnoteContents = (entries: DocxFileEntry[]): Record<string, string> => {
  const fnEntry = entries.find(
    (e) => e.name === "word/footnotes.xml" || e.name === "word\\footnotes.xml",
  );
  if (!fnEntry) return {};

  const xml = fnEntry.content;
  const result: Record<string, string> = {};

  for (const match of xml.matchAll(FOOTNOTE_BLOCK_RE)) {
    const attrs = match[1];
    const body = match[2];

    // Skip system footnotes (separator, continuationSeparator)
    if (attrs.match(FOOTNOTE_TYPE_RE)) continue;

    const idMatch = attrs.match(FOOTNOTE_ID_RE);
    if (!idMatch) continue;
    const id = idMatch[1];

    const textParts: string[] = [];
    for (const t of body.matchAll(FOOTNOTE_TEXT_RE)) {
      textParts.push(t[1]);
    }

    const text = textParts.join("").trim();
    if (text) {
      // Strip the leading footnote number Word often prefixes.
      const stripped = text.replace(/^\d+\s+/, "");
      result[id] = stripped || text;
    }
  }

  return result;
};

export type ConvertResult = {
  json: unknown;
  styleAlignments: Record<string, string>;
  images: Record<string, string>;
  footnotes: Record<string, string>;
};

export const convertDocxBase64 = async (base64Raw: string): Promise<ConvertResult> => {
  const buffer = Buffer.from(base64Raw, "base64");

  const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const { document } = window;

  const [content, media, mediaFiles, fonts] = await (Editor as any).loadXmlData(buffer, true);

  const editor = new (Editor as any)({
    mode: "docx",
    documentId: "headless-import",
    element: document.createElement("div"),
    extensions: getStarterExtensions(),
    fileSource: buffer,
    content,
    media,
    mediaFiles,
    fonts,
    isHeadless: true,
    document,
  });

  const json = editor.getJSON();
  const styleAlignments = extractStyleAlignments(content as DocxFileEntry[]);
  const footnotes = extractFootnoteContents(content as DocxFileEntry[]);

  editor.destroy();
  window.close();

  const images: Record<string, string> = {};
  if (mediaFiles && typeof mediaFiles === "object") {
    for (const [key, value] of Object.entries(mediaFiles)) {
      if (typeof value === "string" && value.length > 0) {
        images[key] = value;
      }
    }
  }

  return { json, styleAlignments, images, footnotes };
};
