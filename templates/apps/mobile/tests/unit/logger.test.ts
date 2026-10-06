import { expect, spyOn, test } from "bun:test";
import { createMobileLogger } from "../../src/lib/logger.ts";

test("mobile logs are structured and redact private fields and bearer credentials", () => {
  const info = spyOn(console, "info").mockImplementation(() => {});
  try {
    const logger = createMobileLogger("auth");

    logger.info("auth.session.loaded", {
      requestId: "request-1",
      userId: "person-1",
      headers: { authorization: "Bearer abc.def.ghi", email: "person@example.test" },
    });

    const event = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(event).toMatchObject({ level: "info", area: "auth", event: "auth.session.loaded", requestId: "request-1" });
    expect(event.userId).toBe("[REDACTED]");
    expect(event.headers).toEqual({ authorization: "[REDACTED]", email: "[REDACTED]" });
    expect(JSON.stringify(event)).not.toContain("abc.def.ghi");
    expect(JSON.stringify(event)).not.toContain("person@example.test");
  } finally {
    info.mockRestore();
  }
});

test("error events omit stack and message data", () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    createMobileLogger("offline").error("offline.store.failed", { error: new Error("private details") });

    const event = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(event.error).toEqual({ name: "Error" });
    expect(JSON.stringify(event)).not.toContain("private details");
  } finally {
    error.mockRestore();
  }
});
