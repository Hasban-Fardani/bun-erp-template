import { expect, test } from "bun:test";

import { ActionLink } from "../src/atoms/action-link";
import { renderEmailDocument } from "../src/render";

test("keeps content non-clickable when no destination is supplied", async () => {
  const html = await renderEmailDocument(<ActionLink>Continue</ActionLink>);

  expect(html).toContain("<span");
  expect(html).not.toMatch(/<a\b/);
});

test("renders a link when the caller supplies a destination", async () => {
  const href = "https://example.test/action";
  const html = await renderEmailDocument(<ActionLink href={href}>Continue</ActionLink>);

  expect(html).toContain(`href="${href}"`);
  expect(html).toContain("Continue");
});
