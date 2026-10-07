import { expect, test } from "bun:test";
import { readOnlineStatus, subscribeOnlineStatus } from "../../src/features/offline/stores/online-status.ts";

test("connection state defaults to online when the platform cannot report it", () => {
  expect(readOnlineStatus()).toBe(true);
});

test("subscribers receive online and offline events and unsubscribe cleanly", () => {
  const listeners = new Map<string, Set<() => void>>();
  const target = {
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  };

  let changes = 0;
  const unsubscribe = subscribeOnlineStatus(() => {
    changes += 1;
  }, target);
  for (const listener of listeners.get("online") ?? []) listener();
  for (const listener of listeners.get("offline") ?? []) listener();
  expect(changes).toBe(2);

  unsubscribe();
  expect(listeners.get("online")?.size ?? 0).toBe(0);
  expect(listeners.get("offline")?.size ?? 0).toBe(0);
});

test("subscribing without an event target returns a safe no-op unsubscribe", () => {
  const unsubscribe = subscribeOnlineStatus(() => {}, {});
  expect(() => unsubscribe()).not.toThrow();
});
