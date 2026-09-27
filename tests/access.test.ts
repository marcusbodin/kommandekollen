import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("BroadcastChannel", undefined);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("private access errors", () => {
  it.each([
    [401, { code: "gate_required" }],
    [503, { code: "gate_unavailable" }],
    [503, { code: "access_config" }],
  ])("clears access and distinguishes HTTP %s from a connection failure", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
    const access = await import("../src/access");
    const closed = vi.fn();
    access.onAccessClosed(closed);
    await expect(access.privateFetch("https://api.example/api/catalog")).rejects.toBeInstanceOf(access.PrivateAccessError);
    expect(closed).toHaveBeenCalledOnce();
    expect(access.accessGeneration()).toBe(1);
  });

  it("preserves the actionable error through the shared access request wrapper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "gate_required" }, { status: 401 })));
    const { accessRequest } = await import("../src/SharedAccess");
    await expect(accessRequest("https://api.example", "/api/gate")).rejects.toThrow("Åtkomsten är stängd");
  });

  it("still identifies an actual network failure as unconfirmed transport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const { accessRequest } = await import("../src/SharedAccess");
    await expect(accessRequest("https://api.example", "/api/gate")).rejects.toThrow("Kunde inte nå tjänsten");
  });
});
