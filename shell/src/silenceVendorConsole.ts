// Suppress noisy [superdoc] / [super-editor] log lines from the SDK so they
// don't clutter the embedder's DevTools console. Errors and warnings still
// pass through. Imported once from main.tsx before the React root mounts.
//
// Matches three call shapes the SDK uses:
//   1. console.log("[superdoc] ...")
//   2. console.log("[superdoc]", "rest")
//   3. console.log("%c[superdoc]", styles, "rest")    // styled prefix
const NOISY = /^(?:%c\s*)?\[(?:superdoc|super-editor)\]/i;

const isNoisy = (args: unknown[]): boolean =>
  args.length > 0 && typeof args[0] === "string" && NOISY.test(args[0]);

for (const method of ["log", "info", "debug"] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (isNoisy(args)) return;
    original(...args);
  };
}
