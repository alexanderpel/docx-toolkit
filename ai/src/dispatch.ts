// Conservative inverse-op posture: most SuperDoc tool calls cannot be safely
// inverted without capturing the document state BEFORE the call (target
// content, marks, alignment, etc. — work this thin dispatcher does not do).
// Returning a wrong inverse silently corrupts the document on undo, so we
// return null for anything we can't prove is round-trip safe. A future
// iteration could capture pre-state inline OR delegate to a Y.UndoManager
// bound to the SuperDoc instance.
import { dispatchSuperDocTool } from "@superdoc-dev/sdk";

type SuperDocDocumentHandle = Parameters<typeof dispatchSuperDocTool>[0];

export type DispatchResult = {
  result: unknown;
  inverseOp: { tool: string; args: Record<string, unknown> } | null;
};

const REVERSIBLE: Record<string, (args: any, result: any) => DispatchResult["inverseOp"]> = {
  // list.indent ↔ list.outdent is a clean structural pair with no
  // state dependency. Both other list actions (create/insert/merge/
  // split/set_*/attach/detach/continue_previous) need pre-state to
  // invert correctly.
  list: (args) => {
    if (args?.action === "indent") return { tool: "list", args: { ...args, action: "outdent" } };
    if (args?.action === "outdent") return { tool: "list", args: { ...args, action: "indent" } };
    return null;
  },
  // comment.create returns an id; deleting that id is a safe round-trip.
  // Other comment actions (update/delete/resolve) need the prior comment
  // body to invert, which we don't have here.
  comment: (args, result: any) => {
    if (args?.action === "create" && result && (result as any).id) {
      return { tool: "comment", args: { action: "delete", id: (result as any).id } };
    }
    return null;
  },
};

// Callers send tool names without the `superdoc_` prefix (e.g.
// "get_content", "format") so the wire stays clean. The SDK's internal
// tool registry keys are full names ("superdoc_get_content"), so we
// re-attach the prefix here before dispatching.
const SDK_PREFIX = "superdoc_";

export const dispatch = async (
  documentHandle: SuperDocDocumentHandle,
  toolName: string,
  args: Record<string, unknown>,
): Promise<DispatchResult> => {
  const sdkToolName = toolName.startsWith(SDK_PREFIX) ? toolName : `${SDK_PREFIX}${toolName}`;
  const result = await dispatchSuperDocTool(documentHandle, sdkToolName, args);
  const inverseFn = REVERSIBLE[toolName];
  const inverseOp = inverseFn ? inverseFn(args, result) : null;
  return { result, inverseOp };
};
