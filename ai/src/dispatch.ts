// Most SuperDoc tools can't be safely inverted without pre-state; return
// null for those rather than a guessed inverse (which would corrupt on undo).
import { dispatchSuperDocTool } from "@superdoc-dev/sdk";

type SuperDocDocumentHandle = Parameters<typeof dispatchSuperDocTool>[0];

export type DispatchResult = {
  result: unknown;
  inverseOp: { tool: string; args: Record<string, unknown> } | null;
};

const REVERSIBLE: Record<string, (args: any, result: any) => DispatchResult["inverseOp"]> = {
  // Only indent↔outdent are structurally reversible without pre-state.
  list: (args) => {
    if (args?.action === "indent") return { tool: "list", args: { ...args, action: "outdent" } };
    if (args?.action === "outdent") return { tool: "list", args: { ...args, action: "indent" } };
    return null;
  },
  // comment.create returns an id we can delete — round-trip safe.
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
  let result: unknown;
  try {
    result = await dispatchSuperDocTool(documentHandle, sdkToolName, args);
  } catch (err) {
    throw rewriteSdkError(err);
  }
  const inverseFn = REVERSIBLE[toolName];
  const inverseOp = inverseFn ? inverseFn(args, result) : null;
  return { result, inverseOp };
};

// Translate SDK errors into action-shaped messages the calling LLM can act
// on without needing to understand SuperDoc internals. The SDK's text is
// accurate but uses internal terminology ("query.match", "handle.ref") that
// the model doesn't know — restating in tool-vocabulary cuts retry loops.
const rewriteSdkError = (err: unknown): Error => {
  const original = err instanceof Error ? err.message : String(err);
  if (/REVISION_MISMATCH|revision-scoped|ephemeral/i.test(original)) {
    return new Error(
      "ref_expired: Refs from docx_get_content are revision-scoped and " +
        "invalidate after ANY mutation (user typing, another tool call, " +
        "awareness). Call docx_get_content again to obtain fresh refs, " +
        "then retry. For multi-step edits, prefer docx_mutations to batch " +
        "ops against a single revision.",
    );
  }
  return err instanceof Error ? err : new Error(original);
};
