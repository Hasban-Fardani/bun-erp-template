import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Input } from "@bun-erp/ui/atoms/input.tsx";
import { Textarea } from "@bun-erp/ui/atoms/textarea.tsx";
import { Field } from "@bun-erp/ui/molecules/field.tsx";
import { FormErrors } from "@bun-erp/ui/molecules/form-errors.tsx";
import { Sheet } from "@bun-erp/ui/organisms/sheet.tsx";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { useForm } from "@tanstack/react-form";
import { Save, ShieldPlus } from "lucide-react";
import { ApiError } from "../../../lib/api.ts";
import { useRoleStatements } from "../hooks/index.ts";
import type { Role } from "../types/index.ts";

/** Role form shared by create and edit modes — the fields are identical. */
export function RoleSheet({
  open,
  onOpenChange,
  role,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  onSubmit: (input: { key: string; name: string; description?: string }) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useI18n();
  const editing = Boolean(role);
  const toast = useToast();
  const form = useForm({
    defaultValues: { key: role?.key ?? "", name: role?.name ?? "", description: role?.description ?? "" },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {};
        if (!/^[a-z0-9_-]{1,64}$/.test(value.key)) fields.key = t("roles.form.keyInvalid");
        if (!value.name.trim() || value.name.length > 120) fields.name = t("roles.form.nameInvalid");
        if (value.description.length > 500) fields.description = t("roles.form.descriptionTooLong");
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit({ ...value, description: value.description || undefined });
        toast.success(editing ? t("roles.form.updated") : t("roles.form.created"));
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("roles.form.saveFailed"));
      }
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      title={editing ? t("roles.form.editTitle") : t("roles.form.createTitle")}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4"
        aria-label={t("roles.form.formLabel")}
      >
        <form.Subscribe selector={(state) => state.values}>
          {({ key, name, description }) => (
            <>
              <h2 className="text-[15px] font-semibold">
                {editing ? t("roles.form.editTitle") : t("roles.form.createTitle")}
              </h2>

              <Field
                id="role-key"
                label={t("roles.form.key")}
                hint={editing ? t("roles.form.keyEditHint") : t("roles.form.keyCreateHint")}
              >
                <Input
                  id="role-key"
                  value={key}
                  onChange={(e) => form.setFieldValue("key", e.target.value)}
                  required
                  disabled={editing}
                  pattern="[a-z0-9_\-]+"
                  maxLength={64}
                />
              </Field>

              <Field id="role-name" label={t("roles.form.name")}>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => form.setFieldValue("name", e.target.value)}
                  required
                  maxLength={120}
                />
              </Field>

              <Field id="role-description" label={t("roles.form.description")}>
                <Textarea
                  id="role-description"
                  value={description}
                  onChange={(e) => form.setFieldValue("description", e.target.value)}
                  maxLength={500}
                />
              </Field>

              <form.Subscribe
                selector={(state) => [
                  ...state.errors,
                  ...Object.values(state.fieldMeta).flatMap((field) => field?.errors ?? []),
                ]}
              >
                {(errors) => <FormErrors errors={errors} />}
              </form.Subscribe>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" icon={editing ? Save : ShieldPlus} disabled={pending}>
                  {pending ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            </>
          )}
        </form.Subscribe>
      </form>
    </Sheet>
  );
}

/** Permission editor: checkboxes built from the server statement catalog, not a copied list. */
export function RolePermissionSheet({
  open,
  onOpenChange,
  role,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
  onSubmit: (permissions: string[]) => Promise<unknown>;
  pending: boolean;
}) {
  const { t } = useI18n();
  const statements = useRoleStatements(open);
  const form = useForm({
    defaultValues: { permissions: role.permissions },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(value.permissions);
        toast.success(t("roles.permissions.saved"));
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t("roles.permissions.saveFailed"));
      }
    },
  });
  const toast = useToast();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      title={t("roles.permissions.title", { name: role.name })}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-5"
        aria-label={t("roles.permissions.formLabel")}
      >
        <form.Subscribe selector={(state) => state.values.permissions}>
          {(draft) => {
            const chosen = new Set(draft);
            const toggle = (permission: string) =>
              form.setFieldValue("permissions", (previous) =>
                previous.includes(permission)
                  ? previous.filter((item) => item !== permission)
                  : [...previous, permission],
              );
            return (
              <>
                <div>
                  <h2 className="text-[15px] font-semibold">{t("roles.permissions.title", { name: role.name })}</h2>
                  <p className="text-[12.5px] text-ink-muted">
                    {t("roles.permissions.selected", { count: draft.length })}
                  </p>
                </div>

                {statements.isPending ? (
                  <p className="text-[13px] text-ink-muted">{t("roles.permissions.loading")}</p>
                ) : statements.isError ? (
                  <p role="alert" className="text-[13px] text-danger">
                    {statements.error instanceof Error ? statements.error.message : t("roles.permissions.loadFailed")}
                  </p>
                ) : (
                  Object.entries(statements.data?.statements ?? {}).map(([resource, actions]) => (
                    <fieldset key={resource} className="space-y-1.5">
                      <legend className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                        {resource}
                      </legend>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {actions.map((action) => {
                          const permission = `${resource}.${action}`;
                          return (
                            <label key={permission} className="inline-flex items-center gap-1.5 text-[13px]">
                              <input
                                type="checkbox"
                                className="size-3.5 accent-accent"
                                checked={chosen.has(permission)}
                                onChange={() => toggle(permission)}
                              />
                              {action}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ))
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" icon={Save} disabled={pending}>
                    {pending ? t("common.saving") : t("roles.permissions.save")}
                  </Button>
                </div>
              </>
            );
          }}
        </form.Subscribe>
      </form>
    </Sheet>
  );
}
