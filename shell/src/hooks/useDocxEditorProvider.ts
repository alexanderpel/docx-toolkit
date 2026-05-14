import { MutableRefObject, useEffect, useRef, useState } from "react";

import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";

const DOCX_ROOM_PREFIX = "docx:";

export type CollabConfig = {
  hocuspocusUrl: string;
  token: string;
  onPermissionDenied?: () => void;
  onAuthError?: (reason: string) => void;
};

export type UseDocxEditorProviderProps = {
  documentId: string;
  collab: CollabConfig | null;
};

export type UseDocxEditorProviderReturn = {
  provider: MutableRefObject<HocuspocusProvider | null>;
  doc: MutableRefObject<Y.Doc>;
  isInitialized: boolean;
  isError: boolean;
};

// Sets up either a Hocuspocus-backed shared Y.Doc (collab mode) or a
// purely-local Y.Doc (demo / standalone mode). The host page decides which
// by supplying or omitting the `collab` argument. The local mode is what
// makes the standalone demo possible — no parent, no backend, just a fresh
// editor.
//
// Provider creation is performed in a useEffect (not during render), so it
// follows React's purity rules and survives StrictMode's mount → unmount
// → remount pattern + Vite HMR without leaking WebSocket connections. The
// effect keys on `documentId` and the `hocuspocusUrl`; token rotation is
// pushed into the existing provider's config so it never recreates the
// connection.
export const useDocxEditorProvider = ({
  documentId,
  collab,
}: UseDocxEditorProviderProps): UseDocxEditorProviderReturn => {
  const [providerLoaded, setProviderLoaded] = useState(collab === null);
  const [error, setError] = useState<string | null>(null);

  const docRef = useRef<Y.Doc>(new Y.Doc());
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const indexeddbPersistenceRef = useRef<IndexeddbPersistence | null>(null);
  const collabRef = useRef(collab);
  collabRef.current = collab;

  // Recreate the Y.Doc + provider whenever the document or the server URL
  // changes. Token rotation does NOT trigger a recreate — that lives in
  // the separate effect below.
  const hocuspocusUrl = collab?.hocuspocusUrl ?? "";
  const initialToken = collab?.token ?? "";
  const isCollab = collab !== null;

  useEffect(() => {
    // Always start with a fresh Y.Doc per document so stale data from a
    // previous mount can't bleed in.
    const yDoc = new Y.Doc();
    docRef.current = yDoc;

    if (!isCollab) {
      // Local-only mode (e.g. ?demo=1). No provider, no IndexedDB, ready
      // immediately so the editor mounts.
      setProviderLoaded(true);
      return () => {
        yDoc.destroy();
      };
    }

    if (!initialToken) {
      // Collab requested but no token yet — wait. When the parent posts
      // refresh-token / the token state updates, this effect will re-run
      // (dependency below) and we'll wire up.
      return () => {
        yDoc.destroy();
      };
    }

    const roomName = `${DOCX_ROOM_PREFIX}${documentId}`;
    const idb = new IndexeddbPersistence(roomName, yDoc);
    indexeddbPersistenceRef.current = idb;

    let hadInitAuth = false;
    let hadInitSync = false;

    const provider = new HocuspocusProvider({
      url: hocuspocusUrl,
      name: roomName,
      token: initialToken,
      document: yDoc,
      onAuthenticated: () => {
        hadInitAuth = true;
      },
      onAuthenticationFailed: (data) => {
        if (data.reason === "permission-denied" && !hadInitAuth) {
          collabRef.current?.onPermissionDenied?.();
          return;
        }
        setError("auth failed");
        collabRef.current?.onAuthError?.(data.reason ?? "unknown");
      },
      onSynced: () => {
        if (!hadInitSync) {
          hadInitSync = true;
          setProviderLoaded(true);
        }
      },
    });
    providerRef.current = provider;

    return () => {
      // Order matters: detach indexeddb first so it doesn't try to write
      // into the doc as the provider tears down.
      idb.destroy();
      provider.destroy();
      yDoc.destroy();

      indexeddbPersistenceRef.current = null;
      providerRef.current = null;
      setProviderLoaded(isCollab ? false : true);
    };
    // We intentionally do NOT depend on `initialToken` for recreation —
    // token rotation flows through the configuration update effect below.
    // Including it here would tear down the WebSocket on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, hocuspocusUrl, isCollab]);

  // Token rotation: just update the live configuration. No recreate.
  useEffect(() => {
    if (providerRef.current && collab?.token) {
      providerRef.current.configuration.token = collab.token;
    }
  }, [collab?.token]);

  return {
    provider: providerRef,
    doc: docRef,
    isInitialized: providerLoaded,
    isError: !!error,
  };
};
