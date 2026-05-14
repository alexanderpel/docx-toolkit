import { useDocxOutline } from "@/editor/useDocxOutline";

type DocxOutlineNavigatorProps = {
  editor: any | null | undefined;
};

export const DocxOutlineNavigator = ({ editor }: DocxOutlineNavigatorProps) => {
  const headings = useDocxOutline(editor);

  if (!headings.length) {
    return (
      <aside className="docx-outline-navigator empty">
        No headings yet. Press <kbd>⌘1</kbd>–<kbd>⌘5</kbd> to start a clause.
      </aside>
    );
  }

  return (
    <aside className="docx-outline-navigator" aria-label="Document outline">
      <ul>
        {headings.map((h) => (
          <li key={`${h.pos}-${h.bookmarkId ?? h.text}`} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
            <button
              type="button"
              className="outline-entry"
              onClick={() => {
                if (!editor?.commands) return;
                if (typeof editor.commands.scrollToHeading === "function") {
                  editor.commands.scrollToHeading(h.pos);
                  return;
                }
                editor.commands.focus?.(h.pos);
              }}
              title={h.text}
            >
              {h.numbering ? <span className="outline-numbering">{h.numbering}</span> : null}
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};
