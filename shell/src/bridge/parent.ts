import type { ParentToShellMessage, ShellToParentMessage } from "./types";

// Build-time configured single origin the shell will trust as the parent.
// In dev this is the Vite-served origin of the embedding page; in prod it is
// the production hero-app origin. Anything else is dropped.
const TRUSTED_PARENT_ORIGIN = import.meta.env.VITE_PARENT_ORIGIN ?? "*";

export const sendToParent = (message: ShellToParentMessage) => {
  if (window.parent === window) return;
  window.parent.postMessage(message, TRUSTED_PARENT_ORIGIN === "*" ? "*" : TRUSTED_PARENT_ORIGIN);
};

export const subscribeToParent = (
  handler: (message: ParentToShellMessage) => void,
): (() => void) => {
  const listener = (event: MessageEvent) => {
    if (TRUSTED_PARENT_ORIGIN !== "*" && event.origin !== TRUSTED_PARENT_ORIGIN) return;
    if (!event.data || typeof event.data !== "object") return;
    if (typeof (event.data as { type?: unknown }).type !== "string") return;
    handler(event.data as ParentToShellMessage);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
};

export const isInIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
