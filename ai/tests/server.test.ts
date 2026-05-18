import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

/**
 * Mock the pool + dispatch boundary. The server is a thin glue between
 * the HTTP layer and these two internal modules; we test that glue here
 * without touching SuperDoc or Hocuspocus for real. `vi.hoisted` lifts
 * the mocks alongside the (already-hoisted) `vi.mock` factories.
 */
const { acquireMock, releaseMock, dispatchMock } = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  releaseMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock("../src/superdocClientPool.js", () => ({
  acquireRoom: acquireMock,
  drainPool: vi.fn(),
}));

vi.mock("../src/dispatch.js", () => ({
  dispatch: dispatchMock,
}));

import { createServer } from "../src/server.js";

beforeEach(() => {
  acquireMock.mockReset();
  releaseMock.mockReset();
  dispatchMock.mockReset();
  // Default: acquire returns a fake handle + a release fn so the finally
  // block in /apply-tool doesn't crash on a null release.
  acquireMock.mockResolvedValue({
    handle: { stub: true },
    release: releaseMock,
  });
});

afterEach(() => {
  delete process.env.AI_SERVICE_SECRET;
});

describe("GET /healthz", () => {
  it("returns { ok: true }", async () => {
    const res = await request(createServer()).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("GET / — AGPL identity", () => {
  it("exposes license, source URL, and a description", async () => {
    const res = await request(createServer()).get("/");
    expect(res.status).toBe(200);
    expect(res.body.license).toBe("AGPL-3.0-or-later");
    expect(res.body.source).toMatch(/^https?:\/\//);
    expect(typeof res.body.description).toBe("string");
  });
});

describe("POST /apply-tool — auth gate", () => {
  it("when AI_SERVICE_SECRET is unset, accepts requests without a header", async () => {
    dispatchMock.mockResolvedValue({ result: { ok: true }, inverseOp: null });
    const res = await request(createServer())
      .post("/apply-tool")
      .send({ documentId: "doc-1", tool: "get_content" });
    expect(res.status).toBe(200);
  });

  it("when AI_SERVICE_SECRET is set, rejects requests with the wrong header", async () => {
    process.env.AI_SERVICE_SECRET = "expected-secret";
    const res = await request(createServer())
      .post("/apply-tool")
      .set("X-AI-Secret", "wrong")
      .send({ documentId: "doc-1", tool: "get_content" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("accepts requests with the matching X-AI-Secret header", async () => {
    process.env.AI_SERVICE_SECRET = "expected-secret";
    dispatchMock.mockResolvedValue({ result: { ok: true }, inverseOp: null });
    const res = await request(createServer())
      .post("/apply-tool")
      .set("X-AI-Secret", "expected-secret")
      .send({ documentId: "doc-1", tool: "get_content" });
    expect(res.status).toBe(200);
  });
});

describe("POST /apply-tool — body validation", () => {
  it("400s when documentId is missing", async () => {
    const res = await request(createServer())
      .post("/apply-tool")
      .send({ tool: "get_content" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing documentId/);
  });

  it("400s when tool is missing", async () => {
    const res = await request(createServer())
      .post("/apply-tool")
      .send({ documentId: "doc-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing.*tool/);
  });
});

describe("POST /apply-tool — dispatch wiring", () => {
  it("acquires a room, calls dispatch, and returns { result, inverseOp }", async () => {
    dispatchMock.mockResolvedValue({
      result: { word_count: 12 },
      inverseOp: { tool: "list", args: { action: "outdent" } },
    });

    const res = await request(createServer())
      .post("/apply-tool")
      .send({ documentId: "doc-7", tool: "get_content", args: { action: "info" } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      result: { word_count: 12 },
      inverseOp: { tool: "list", args: { action: "outdent" } },
    });
    expect(acquireMock).toHaveBeenCalledWith("doc-7");
    expect(dispatchMock).toHaveBeenCalledWith(
      { stub: true },
      "get_content",
      { action: "info" },
    );
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("releases the pool slot even when dispatch throws", async () => {
    dispatchMock.mockRejectedValue(new Error("dispatch boom"));
    const res = await request(createServer())
      .post("/apply-tool")
      .send({ documentId: "doc-9", tool: "edit" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("dispatch failed");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT call release when acquireRoom itself fails", async () => {
    acquireMock.mockRejectedValueOnce(new Error("hocuspocus down"));
    const res = await request(createServer())
      .post("/apply-tool")
      .send({ documentId: "doc-9", tool: "edit" });
    expect(res.status).toBe(500);
    expect(releaseMock).not.toHaveBeenCalled();
  });
});
