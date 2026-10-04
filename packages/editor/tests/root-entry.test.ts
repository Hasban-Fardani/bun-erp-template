import { describe, expect, test } from "bun:test";
import * as editorTypes from "@bun-erp/editor";

describe("package root entry", () => {
  test("has no runtime exports for server and Worker consumers", () => {
    expect(Object.keys(editorTypes)).toEqual([]);
  });
});
