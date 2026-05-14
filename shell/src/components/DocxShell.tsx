import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SuperDoc } from "superdoc";
import "superdoc/style.css";

import { USER_PRESENCE_COLORS } from "@/constants/userPresenceColors";
import { createDocxHeadingShortcuts } from "@/editor/docxHeadingShortcuts";
import { useDocxEditorProvider, type CollabConfig } from "@/hooks/useDocxEditorProvider";

import { DocxOutlineNavigator } from "./DocxOutlineNavigator";

import type { AwarenessUser, ShellMode, ShellUser } from "@/bridge/types";

const SAVE_DEBOUNCE_MS = 5000;

export type SaveStrategy =
  | { kind: "rest"; restBaseUrl: string; getToken: () => string }
  | { kind: "noop" };

export type DocxShellProps = {
  documentId: string;
  mode: ShellMode;
  user: ShellUser;
  collab: CollabConfig | null;
  saveStrategy: SaveStrategy;
  fetchDownloadMeta: () => Promise<{ url: string | null; seededAt: number | null } | null>;
  onAwareness?: (users: AwarenessUser[]) => void;
  onError?: (code: string, message: string) => void;
};

const deriveActiveUsers = (
  states: Array<{
    clientId: number;
    user?: { name?: string; email?: string; image?: string | null; color?: string };
  }>,
  selfClientId: number,
): AwarenessUser[] => {
  const byUserId = new Map<string, AwarenessUser>();
  for (const state of states) {
    if (!state?.user || state.clientId === selfClientId) continue;
    const dedupeKey = state.user.email ?? `client-${state.clientId}`;
    if (byUserId.has(dedupeKey)) continue;
    byUserId.set(dedupeKey, {
      clientId: state.clientId,
      name: state.user.name ?? "Guest",
      email: state.user.email,
      image: state.user.image ?? null,
      color: state.user.color,
    });
  }
  return Array.from(byUserId.values());
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const arrayBuffer = await blob.arrayBuffer();
  return btoa(new Uint8Array(arrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ""));
};

export const DocxShell = ({
  documentId,
  mode,
  user,
  collab,
  saveStrategy,
  fetchDownloadMeta,
  onAwareness,
  onError,
}: DocxShellProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const superdocRef = useRef<SuperDoc | null>(null);
  const editorRef = useRef<any | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const seededRef = useRef(false);

  const [activeEditor, setActiveEditor] = useState<any | null>(null);

  const { provider, doc, isInitialized, isError } = useDocxEditorProvider({
    documentId,
    collab,
  });

  const editorExtensions = useMemo(() => [createDocxHeadingShortcuts()], []);

  const performSave = useCallback(
    async (base64: string) => {
      if (saveStrategy.kind === "noop") return;
      const res = await fetch(`${saveStrategy.restBaseUrl}/api/document/docx/${documentId}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Host-specific auth header — see IframeBootstrap.tsx for context.
          "user-firebase-token": saveStrategy.getToken(),
        },
        body: JSON.stringify({ base64 }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
    },
    [documentId, saveStrategy],
  );

  const markSeeded = useCallback(async () => {
    if (saveStrategy.kind === "noop" || seededRef.current) return;
    seededRef.current = true;
    try {
      await fetch(`${saveStrategy.restBaseUrl}/api/document/docx/${documentId}/mark-seeded`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Host-specific auth header — see IframeBootstrap.tsx for context.
          "user-firebase-token": saveStrategy.getToken(),
        },
      });
    } catch (err) {
      console.error("[DocxShell] mark-seeded failed:", err);
    }
  }, [documentId, saveStrategy]);

  const scheduleSave = useCallback(() => {
    if (!superdocRef.current) return;
    if (mode !== "edit") return;
    if (saveStrategy.kind === "noop") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      if (!superdocRef.current || isSavingRef.current) return;
      isSavingRef.current = true;
      try {
        const blob = (await superdocRef.current.export({
          exportType: ["docx"],
          triggerDownload: false,
        })) as Blob | undefined;
        if (!blob) return;
        const base64 = await blobToBase64(blob);
        await performSave(base64);
      } catch (err) {
        console.error("[DocxShell] save failed:", err);
        onError?.("save-failed", err instanceof Error ? err.message : String(err));
      } finally {
        isSavingRef.current = false;
      }
    }, SAVE_DEBOUNCE_MS);
  }, [mode, saveStrategy, performSave, onError]);

  useEffect(() => {
    if (!isInitialized || !containerRef.current) return;

    let cancelled = false;
    let instance: SuperDoc | null = null;

    (async () => {
      const meta = await fetchDownloadMeta();
      if (cancelled) return;

      let docFile: File | undefined;
      const needsSeed = !meta?.seededAt;
      if (needsSeed && meta?.url) {
        try {
          const res = await fetch(meta.url);
          const blob = await res.blob();
          docFile = new File([blob], `${documentId}.docx`, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
        } catch (err) {
          console.error("[DocxShell] failed to fetch blob:", err);
        }
      }
      if (cancelled) return;

      // SuperDoc's `_initializeDocumentData` drops `data`/`url` when
      // `modules.collaboration` is set unless the per-document entry is
      // flagged `isNewFile: true`. So we pair the blob, Y.Doc, and provider
      // on the document object — that's the path that actually parses the
      // .docx into the Y.Doc on first open.
      const baseConfig: Record<string, unknown> = {
        selector: containerRef.current!,
        format: "docx",
        documentMode: mode === "preview" ? "viewing" : "editing",
        user,
        users: [user],
        colors: USER_PRESENCE_COLORS as unknown as string[],
        editorExtensions,
        documents: [
          collab
            ? {
                id: documentId,
                type: "docx",
                name: `${documentId}.docx`,
                data: docFile ?? null,
                isNewFile: needsSeed,
                ydoc: doc.current,
                provider: provider.current!,
              }
            : {
                id: documentId,
                type: "docx",
                name: `${documentId}.docx`,
                data: docFile ?? null,
                isNewFile: true,
              },
        ],
        onAwarenessUpdate: ({ states }: { states: any[] }) => {
          const selfClientId = doc.current.clientID;
          onAwareness?.(deriveActiveUsers(states, selfClientId));
        },
        onEditorCreate: (editor: any) => {
          editorRef.current = editor;
          setActiveEditor(editor);
        },
        onEditorUpdate: () => scheduleSave(),
        onReady: () => {
          if (needsSeed && mode === "edit") {
            markSeeded();
            scheduleSave();
          }
        },
      };

      if (collab && provider.current) {
        baseConfig.modules = {
          collaboration: {
            ydoc: doc.current,
            provider: provider.current,
          },
        };
      }

      instance = new SuperDoc(baseConfig as any);
      superdocRef.current = instance;
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      instance?.destroy?.();
      superdocRef.current = null;
      editorRef.current = null;
      setActiveEditor(null);
    };
  }, [
    isInitialized,
    documentId,
    doc,
    provider,
    mode,
    user,
    collab,
    editorExtensions,
    fetchDownloadMeta,
    scheduleSave,
    markSeeded,
    onAwareness,
  ]);

  if (isError) {
    return <div className="docx-shell-error">Failed to connect to the document.</div>;
  }

  return (
    <div className="docx-shell">
      <div className="docx-shell-body">
        <div ref={containerRef} className="docx-shell-canvas" />
        {mode === "edit" ? (
          <aside className="docx-shell-outline">
            <DocxOutlineNavigator editor={activeEditor} />
          </aside>
        ) : null}
      </div>
    </div>
  );
};
