import { expect, test } from "bun:test";
import { checkInteractiveSurface } from "../../../../gates/interactive-surface.ts";

test("persistent errors stay contextual and new inline alerts require review", async () => {
  const root = `${process.env.TMPDIR ?? "/tmp"}/erp-surface-${Bun.randomUUIDv7()}`;
  try {
    await Bun.write(
      `${root}/apps/web/src/features/roles/components/role-sheet.tsx`,
      '<p role="alert">Permission catalogue could not load</p>',
    );
    await Bun.write(`${root}/apps/web/src/features/identity/screens/login.tsx`, '<p role="alert">Sign in failed</p>');
    await Bun.write(
      `${root}/apps/mobile/src/features/offline/components/offline-drafts.tsx`,
      '<p role="alert">Local storage is unavailable</p>',
    );
    await Bun.write(
      `${root}/packages/ui/src/molecules/form-errors.tsx`,
      '<ul role="alert"><li>Correct this field</li></ul>',
    );
    await Bun.write(
      `${root}/apps/web/src/features/example/screens/example.tsx`,
      '<p role="alert">Something happened</p>',
    );

    const findings = await checkInteractiveSurface(root);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: "apps/web/src/features/example/screens/example.tsx",
      rule: "INLINE_ALERT",
    });
  } finally {
    await Bun.$`rm -r ${root}`.quiet();
  }
});
