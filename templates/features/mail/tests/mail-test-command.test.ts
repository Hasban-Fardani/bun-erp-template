import { expect, test } from "bun:test";
import { createMailer, createMemoryMailDriver } from "@bun-erp/mail/server";
import { runMailTest } from "@/cli/lib/mail-test.ts";
import { testEnv } from "../../support/fixtures.ts";

const logger = { info: () => {} };

test("mail:test sends one plain message through the driver and reports driver and messageId", async () => {
  const driver = createMemoryMailDriver();
  const result = await runMailTest(createMailer({ config: testEnv, logger, driver }), "ops@example.test");

  expect(result).toMatchObject({ ok: true, driver: "memory" });
  expect(result.ok && result.messageId).toBeTruthy();
  expect(driver.sent).toHaveLength(1);
  expect(driver.sent[0]?.to).toEqual([{ address: "ops@example.test", name: "" }]);
});

test("mail:test verifies the transport first and reports a failure without sending", async () => {
  const driver = {
    ...createMemoryMailDriver(),
    verify: async () => {
      throw new Error("Invalid login: 535 authentication failed");
    },
  };
  const result = await runMailTest(createMailer({ config: testEnv, logger, driver }), "ops@example.test");

  expect(result).toEqual({ ok: false, driver: "memory", error: "Invalid login: 535 authentication failed" });
});

test("mail:test reports a rejected send as a failure", async () => {
  const result = await runMailTest(createMailer({ config: testEnv, logger }), "not-an-address");

  expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Invalid email address") });
});
