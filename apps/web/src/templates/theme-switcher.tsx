import { useI18n } from "@bun-erp/i18n/react";
import { SimpleSelect } from "@bun-erp/ui/molecules/select.tsx";
import { cn } from "../lib/cn.ts";
import { isThemePreference } from "../lib/theme.ts";
import { useTheme } from "../lib/theme.tsx";

/**
 * Runtime palette switch. The dark tokens already existed; without a control the choice only
 * lived in a build variable, which is a setting most operators cannot reach.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  return (
    <SimpleSelect
      size="sm"
      className={cn("w-28", className)}
      label={t("theme.label")}
      value={preference}
      testId="theme-switcher"
      onValueChange={(value) => {
        if (isThemePreference(value)) setPreference(value);
      }}
      options={[
        { value: "light", label: t("theme.light") },
        { value: "dark", label: t("theme.dark") },
        { value: "system", label: t("theme.system") },
      ]}
    />
  );
}
