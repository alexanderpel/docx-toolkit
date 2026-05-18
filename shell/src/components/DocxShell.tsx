import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SuperDoc } from "superdoc";
import "superdoc/style.css";

import { USER_PRESENCE_COLORS } from "@/constants/userPresenceColors";
import { createDocxHeadingShortcuts } from "@/editor/docxHeadingShortcuts";
import { useDocxEditorProvider, type CollabConfig } from "@/hooks/useDocxEditorProvider";

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
  /** Fired once per documentId after the editor has rendered AND the
   *  fit-to-width zoom has been applied. Hosts can use this to dismiss a
   *  loading skeleton so the user never sees the intermediate flicker. */
  onFirstPaint?: () => void;
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
  onFirstPaint,
}: DocxShellProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const superdocRef = useRef<SuperDoc | null>(null);
  const editorRef = useRef<any | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const seededRef = useRef(false);

  const [zoom, setZoom] = useState(100);
  const ZOOM_MIN = 50;
  const ZOOM_MAX = 200;
  const ZOOM_STEP = 10;
  const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z)));
  // Track whether we've already auto-fit the current doc, so user zoom
  // changes aren't overwritten by re-renders.
  const hasFitToWidthRef = useRef<string | null>(null);
  const firstPaintFiredRef = useRef<string | null>(null);
  // SuperDoc is created inside an async IIFE. The setZoom effect can run
  // and skip BEFORE that IIFE finishes assigning superdocRef.current —
  // so we mirror zoom into a ref and re-apply it right after instance
  // creation. Without this, the widget shows e.g. 200% but the document
  // stays at SuperDoc's default 100% until the user nudges zoom again.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

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
        },
        onEditorUpdate: () => scheduleSave(),
        onReady: () => {
          // Apply the current zoom HERE — by the time onReady fires,
          // SuperDoc's reactive store is fully wired and pages are
          // mounted. Calling setZoom right after `new SuperDoc()` was
          // too early; the instance accepted the value but didn't
          // propagate it to the page renderers.
          try {
            (superdocRef.current as any)?.setZoom?.(zoomRef.current);
          } catch (err) {
            console.error("[DocxShell] onReady setZoom failed:", err);
          }
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
      // Zoom is applied in the SuperDoc `onReady` callback above —
      // calling setZoom here is too early; the value is accepted but
      // not propagated to the page renderers until onReady fires.
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

  // Push zoom changes into SuperDoc. The instance exposes setZoom(percent)
  // and updates all pages reactively. We re-apply on (zoom, ready) so the
  // value sticks across re-mounts.
  useEffect(() => {
    const instance = superdocRef.current as any;
    if (!instance || typeof instance.setZoom !== "function") return;
    try {
      instance.setZoom(zoom);
    } catch (err) {
      console.error("[DocxShell] setZoom failed:", err);
    }
  }, [zoom, isInitialized]);

  // Pre-compute the fit-to-width zoom SYNCHRONOUSLY before SuperDoc
  // mounts, so the first render uses the right zoom — no measure-then-
  // jump cycle. We assume standard US Letter at 96 DPI (816px). A4
  // (794px) and landscape (1056px) will be slightly off but render
  // without visible flicker (skeleton hides the bootstrap entirely),
  // and the user can adjust with the zoom widget. Doing this in a
  // useLayoutEffect (not useEffect) means it commits BEFORE the
  // SuperDoc-creation useEffect runs, so SuperDoc starts at target
  // zoom rather than 100%.
  useLayoutEffect(() => {
    if (hasFitToWidthRef.current === documentId) return;
    const canvas = containerRef.current;
    if (!canvas) return;
    const canvasWidth = canvas.clientWidth;
    if (canvasWidth <= 0) return;
    const availableWidth = Math.max(canvasWidth - 64, 0);
    const target = clampZoom(Math.floor((availableWidth / 816) * 100));
    hasFitToWidthRef.current = documentId;
    setZoom(target);
  }, [documentId]);

  // Fire first-paint once SuperDoc is initialized + zoom is committed.
  // Two animation frames give Vue/SuperDoc time to flush its reactive
  // render — fast enough to feel instant, slow enough to never reveal
  // an intermediate state.
  useEffect(() => {
    if (!isInitialized) return;
    if (firstPaintFiredRef.current === documentId) return;
    if (hasFitToWidthRef.current !== documentId) return;
    let raf2: number | null = null;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        firstPaintFiredRef.current = documentId;
        onFirstPaint?.();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
    };
  }, [isInitialized, documentId, zoom, onFirstPaint]);

  // Keyboard shortcuts: Cmd/Ctrl + = / − / 0. Bound on window so they fire
  // anywhere inside the iframe, not just when the editor has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => clampZoom(z + ZOOM_STEP));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => clampZoom(z - ZOOM_STEP));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(100);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isError) {
    return <div className="docx-shell-error">Failed to connect to the document.</div>;
  }

  return (
    <div className="docx-shell">
      <div className="docx-shell-body">
        <div ref={containerRef} className="docx-shell-canvas" />
      </div>
      <div className="docx-shell-zoom" role="group" aria-label="Zoom controls">
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="docx-shell-zoom-reset"
          onClick={() => setZoom(100)}
          title="Reset to 100%"
        >
          {zoom}%
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
};
