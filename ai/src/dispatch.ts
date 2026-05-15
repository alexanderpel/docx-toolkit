import { dispatchSuperDocTool } from "@superdoc-dev/sdk";

// The SDK's dispatchSuperDocTool wants a BoundDocApi (a SuperDocDocument handle
// from `client.open()`), not a raw Y.Doc. We pick the parameter type up directly
// off the SDK so this stays in sync if upstream changes the contract.
type SuperDocDocumentHandle = Parameters<typeof dispatchSuperDocTool>[0];

export type DispatchResult = {
  result: unknown;
  // Best-effort reverse op for the undo stack. null when not reversible
  // (e.g. get_content). The agent runner stores this; on undo it issues
  // a new POST /apply-tool with these args.
  inverseOp: { tool: string; args: Record<string, unknown> } | null;
};

type InverseFn = (args: any, result: any) => DispatchResult["inverseOp"];

const REVERSIBLE: Record<string, InverseFn> = {
  edit: (args) => {
    if (args?.action === "insert") {
      return {
        tool: "edit",
        args: { action: "delete", target: args.target, length: (args.content ?? "").length },
      };
    }
    if (args?.action === "delete") {
      return { tool: "edit", args: { action: "insert", target: args.target, content: args.previousContent } };
    }
    if (args?.action === "replace") {
      return { tool: "edit", args: { action: "replace", target: args.target, content: args.previousContent } };
    }
    return null;
  },
  format: (args) => ({ tool: "format", args: { ...args, action: invertFormatAction(args.action) } }),
  create: (_args, result) => {
    if (result?.id) return { tool: "edit", args: { action: "delete", target: result.id } };
    return null;
  },
  list: (args) => ({ tool: "list", args: { ...args, action: invertListAction(args.action) } }),
  comment: (args, result) => {
    if (args?.action === "create" && result?.id) {
      return { tool: "comment", args: { action: "delete", id: result.id } };
    }
    return null;
  },
};

const invertFormatAction = (a: string): string => ({ inline: "inline" } as Record<string, string>)[a] ?? a;
const invertListAction = (a: string): string =>
  ({ indent: "outdent", outdent: "indent" } as Record<string, string>)[a] ?? a;

export const dispatch = async (
  documentHandle: SuperDocDocumentHandle,
  toolName: string,
  args: Record<string, unknown>,
): Promise<DispatchResult> => {
  const result = await dispatchSuperDocTool(documentHandle, toolName, args);

  const inverseFn = REVERSIBLE[toolName];
  const inverseOp = inverseFn ? inverseFn(args, result) : null;

  return { result, inverseOp };
};
