import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { DocxShell, type SaveStrategy } from "@/components/DocxShell";
import { sendToParent, subscribeToParent } from "@/bridge/parent";
import { applyTheme } from "@/theme/applyTheme";

import type { AwarenessUser, ParentToShellMessage, ShellMode, ShellUser } from "@/bridge/types";

type InitPayload = Extract<ParentToShellMessage, { type: "init" }>;

type IframeBootstrapProps = {
  mode: ShellMode;
};

// Bootstraps the shell when running inside an iframe: posts `ready`, waits
// for the parent's `init`, applies theme, then renders the DocxShell. All
// further parent traffic (refresh-token, set-theme, destroy) flows through
// the same subscriber.
export const IframeBootstrap = ({ mode }: IframeBootstrapProps) => {
  const params = useParams();
  const urlDocumentId = params.documentId ?? "";

  const [init, setInit] = useState<InitPayload | null>(null);
  const [token, setToken] = useState<string>("");
  const [destroyed, setDestroyed] = useState(false);
  const tokenRef = useRef("");

  useEffect(() => {
    const unsubscribe = subscribeToParent((message) => {
      if (message.type === "init") {
        if (urlDocumentId && message.documentId !== urlDocumentId) {
          sendToParent({
            type: "error",
            code: "document-id-mismatch",
            message: `init.documentId=${message.documentId} but URL has ${urlDocumentId}`,
          });
          return;
        }
        if (message.mode !== mode) {
          sendToParent({
            type: "error",
            code: "mode-mismatch",
            message: `init.mode=${message.mode} but route expects ${mode}`,
          });
          return;
        }
        applyTheme(message.theme, message.themeTokens);
        setInit(message);
        setToken(message.authToken);
        tokenRef.current = message.authToken;
        return;
      }
      if (message.type === "refresh-token") {
        setToken(message.authToken);
        tokenRef.current = message.authToken;
        return;
      }
      if (message.type === "set-theme") {
        applyTheme(message.theme, message.themeTokens);
        return;
      }
      if (message.type === "destroy") {
        setDestroyed(true);
        return;
      }
    });

    sendToParent({ type: "ready" });

    return unsubscribe;
  }, [mode, urlDocumentId]);

  const fetchDownloadMeta = useCallback(async () => {
    if (!init) return null;
    const res = await fetch(
      `${init.restBaseUrl}/api/document/docx/${init.documentId}/download-url`,
      {
        // Host-specific auth header. The embedder's REST API reads the
        // bearer token from `user-firebase-token` (not `Authorization`).
        // The header name is part of the host's public contract; the
        // shell carries the value, not the auth logic.
        headers: { "user-firebase-token": tokenRef.current },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string | null; seededAt?: number | null };
    return { url: data.url ?? null, seededAt: data.seededAt ?? null };
  }, [init]);

  const handleAwareness = useCallback((users: AwarenessUser[]) => {
    sendToParent({ type: "awareness", users });
  }, []);

  const handleError = useCallback((code: string, message: string) => {
    sendToParent({ type: "error", code, message });
  }, []);

  const user: ShellUser | null = useMemo(() => (init ? init.user : null), [init]);

  const saveStrategy = useMemo<SaveStrategy | null>(() => {
    if (!init) return null;
    return {
      kind: "rest",
      restBaseUrl: init.restBaseUrl,
      getToken: () => tokenRef.current,
    };
  }, [init]);

  if (destroyed) {
    return null;
  }

  if (!init || !user || !saveStrategy) {
    return (
      <div className="docx-shell-loading">
        Waiting for host…
      </div>
    );
  }

  return (
    <DocxShell
      documentId={init.documentId}
      mode={mode}
      user={user}
      collab={{
        hocuspocusUrl: init.hocuspocusUrl,
        token,
        onPermissionDenied: () =>
          sendToParent({ type: "error", code: "permission-denied", message: "auth rejected" }),
        onAuthError: (reason) =>
          sendToParent({ type: "error", code: "auth-error", message: reason }),
      }}
      saveStrategy={saveStrategy}
      fetchDownloadMeta={fetchDownloadMeta}
      onAwareness={handleAwareness}
      onError={handleError}
      onFirstPaint={() => sendToParent({ type: "first-paint" })}
    />
  );
};
