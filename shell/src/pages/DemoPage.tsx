import { useCallback, useMemo } from "react";

import { DocxShell, type SaveStrategy } from "@/components/DocxShell";

import type { ShellUser } from "@/bridge/types";

// Standalone demo: no parent, no backend. A purely-local Y.Doc, no
// Hocuspocus, no save loop. Proves the shell is a complete editor that
// works against mock data — independent of any host. AGPL Mandatory
// Invariant 3 requires the shell to be runnable this way.
const DEMO_USER: ShellUser = {
  name: "Demo User",
  email: "demo@example.com",
  image: null,
  color: "#1E88E5",
};

const DEMO_SAVE_STRATEGY: SaveStrategy = { kind: "noop" };

export const DemoPage = () => {
  // A minimal docx is bundled at /demo.docx so SuperDoc has something to
  // parse on first paint. seededAt: null keeps `isNewFile` true so SuperDoc
  // initializes its Y.Doc from the blob.
  const fetchDownloadMeta = useCallback(
    async () => ({ url: `${window.location.origin}/demo.docx`, seededAt: null }),
    [],
  );

  const banner = useMemo(
    () => (
      <div className="docx-shell-banner">
        <strong>Demo mode</strong> — standalone, no host page, no backend. Edits stay in this tab.
      </div>
    ),
    [],
  );

  return (
    <div className="docx-shell-demo">
      {banner}
      <DocxShell
        documentId="demo-document"
        mode="edit"
        user={DEMO_USER}
        collab={null}
        saveStrategy={DEMO_SAVE_STRATEGY}
        fetchDownloadMeta={fetchDownloadMeta}
      />
    </div>
  );
};
