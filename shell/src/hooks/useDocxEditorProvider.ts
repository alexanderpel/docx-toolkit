import { MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

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
export const useDocxEditorProvider = ({
  documentId,
  collab,
}: UseDocxEditorProviderProps): UseDocxEditorProviderReturn => {
  const [providerLoaded, setProviderLoaded] = useState(collab === null);
  const [error, setError] = useState<string | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState(documentId);

  const docRef = useRef(new Y.Doc());
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const indexeddbPersistenceRef = useRef<IndexeddbPersistence | null>(null);
  const hadInitAuth = useRef(false);
  const hadInitSync = useRef(false);
  const collabRef = useRef(collab);
  collabRef.current = collab;

  const handleCleanup = () => {
    indexeddbPersistenceRef.current?.destroy();
    providerRef.current?.destroy();
    docRef.current?.destroy();

    docRef.current = new Y.Doc();
    providerRef.current = null;
    indexeddbPersistenceRef.current = null;
    hadInitAuth.current = false;
    hadInitSync.current = false;

    setProviderLoaded(collabRef.current === null);
  };

  if (collab && !providerRef.current && collab.token) {
    const roomName = `${DOCX_ROOM_PREFIX}${documentId}`;
    indexeddbPersistenceRef.current = new IndexeddbPersistence(roomName, docRef.current);

    providerRef.current = new HocuspocusProvider({
      url: collab.hocuspocusUrl,
      name: roomName,
      token: collab.token,
      document: docRef.current,
      onAuthenticated: () => {
        hadInitAuth.current = true;
      },
      onAuthenticationFailed: (data) => {
        if (data.reason === "permission-denied" && !hadInitAuth.current) {
          collabRef.current?.onPermissionDenied?.();
          return;
        }
        setError("auth failed");
        collabRef.current?.onAuthError?.(data.reason ?? "unknown");
      },
      onSynced: () => {
        if (!hadInitSync.current) {
          hadInitSync.current = true;
          setProviderLoaded(true);
        }
      },
    });
  }

  useLayoutEffect(() => {
    if (currentDocumentId !== documentId) {
      handleCleanup();
      setCurrentDocumentId(documentId);
      return;
    }
    return () => handleCleanup();
  }, [documentId, currentDocumentId]);

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
