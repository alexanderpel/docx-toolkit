import { describe, it, expect, vi } from "vitest";
import { dispatch } from "../src/dispatch.js";

// Mock @superdoc-dev/sdk's dispatchSuperDocTool so we don't need a live
// SuperDoc client. The dispatcher's job here is just to forward args and
// wrap the result with an inverseOp.
//
// dispatch() re-attaches the `superdoc_` SDK prefix before calling the
// mock — so we match on `endsWith` rather than equality, otherwise the
// `comment` case never fires and the inverse-op test sees `null`.
vi.mock("@superdoc-dev/sdk", async () => ({
  dispatchSuperDocTool: vi.fn(async (_handle: unknown, tool: string, _args: any) => {
    if (tool.endsWith("comment")) return { id: "comment-xyz" };
    return { ok: true };
  }),
}));

describe("dispatch", () => {
  const stubHandle = {} as Parameters<typeof dispatch>[0];

  it("returns { result, inverseOp } shape", async () => {
    const out = await dispatch(stubHandle, "get_content", { action: "info" });
    expect(out).toHaveProperty("result");
    expect(out).toHaveProperty("inverseOp");
  });

  it("inverseOp is null for non-reversible tools (get_content)", async () => {
    const out = await dispatch(stubHandle, "get_content", { action: "info" });
    expect(out.inverseOp).toBeNull();
  });

  it("inverseOp inverts list.indent → list.outdent", async () => {
    const out = await dispatch(stubHandle, "list", { action: "indent", target: "x" });
    expect(out.inverseOp).toEqual({
      tool: "list",
      args: expect.objectContaining({ action: "outdent" }),
    });
  });

  it("inverseOp for comment.create points to delete with returned id", async () => {
    const out = await dispatch(stubHandle, "comment", { action: "create", body: "hi" });
    expect(out.inverseOp).toEqual({
      tool: "comment",
      args: { action: "delete", id: "comment-xyz" },
    });
  });
});
