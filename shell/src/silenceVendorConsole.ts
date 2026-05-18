// Suppress noisy [superdoc] / [super-editor] log lines from the SDK so they
// don't clutter the embedder's DevTools console. Errors and warnings still
// pass through. Imported once from main.tsx before the React root mounts.
const NOISY = /^\[(superdoc|super-editor)\]/;

const filterArgs = (args: unknown[]): boolean => {
  const first = args[0];
  return typeof first === "string" && NOISY.test(first);
};

for (const method of ["log", "info", "debug"] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (filterArgs(args)) return;
    original(...args);
  };
}
