import { useEffect, useState } from "react";

export type DocxOutlineEntry = {
  pos: number;
  level: number;
  text: string;
  numbering?: string;
  bookmarkId?: string;
};

export const useDocxOutline = (editor: any | null | undefined): DocxOutlineEntry[] => {
  const [entries, setEntries] = useState<DocxOutlineEntry[]>([]);

  useEffect(() => {
    if (!editor?.state) return;

    const recompute = () => {
      const next: DocxOutlineEntry[] = [];
      editor.state.doc.descendants((node: any, pos: number) => {
        const isHeading = node.type?.name === "heading" || node.type?.name?.startsWith("heading");
        if (isHeading && typeof node.attrs?.level === "number") {
          next.push({
            pos,
            level: node.attrs.level,
            text: node.textContent || "Heading",
            numbering: node.attrs.numbering,
            bookmarkId: node.attrs.bookmarkId,
          });
        }
      });
      setEntries(next);
    };

    recompute();

    const onUpdate = () => recompute();
    editor.on?.("update", onUpdate);
    return () => {
      editor.off?.("update", onUpdate);
    };
  }, [editor]);

  return entries;
};
