import type { ParentToShellMessage, ShellToParentMessage } from "./types";

// VITE_PARENT_ORIGIN baked at build time. Prod builds without it fail closed
// (postMessage disabled) so auth tokens can't leak to a malicious embedder.
const RAW_PARENT_ORIGIN = import.meta.env.VITE_PARENT_ORIGIN as string | undefined;
const IS_DEV = import.meta.env.DEV === true;
const TRUSTED_PARENT_ORIGIN: string | null =
  RAW_PARENT_ORIGIN && RAW_PARENT_ORIGIN.trim() !== ""
    ? RAW_PARENT_ORIGIN
    : IS_DEV
    ? "*"
    : null;

if (!IS_DEV && TRUSTED_PARENT_ORIGIN === null) {
  console.error(
    "[shell] VITE_PARENT_ORIGIN is not set in this build. " +
      "postMessage is disabled until the build is rebuilt with a valid origin.",
  );
}

export const sendToParent = (message: ShellToParentMessage) => {
  if (window.parent === window) return;
  if (TRUSTED_PARENT_ORIGIN === null) return;
  window.parent.postMessage(message, TRUSTED_PARENT_ORIGIN);
};

export const subscribeToParent = (
  handler: (message: ParentToShellMessage) => void,
): (() => void) => {
  const listener = (event: MessageEvent) => {
    if (TRUSTED_PARENT_ORIGIN === null) return;
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
