import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Input } from "@bun-erp/ui/atoms/input.tsx";
import { Field } from "@bun-erp/ui/molecules/field.tsx";
import { FormErrors } from "@bun-erp/ui/molecules/form-errors.tsx";
import { Combobox } from "@bun-erp/ui/organisms/combobox.tsx";
import { Sheet } from "@bun-erp/ui/organisms/sheet.tsx";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { useForm } from "@tanstack/react-form";
import { Save, UserPlus } from "lucide-react";
import { ApiError } from "../../../lib/api.ts";
import { useCreateUser, useRoles } from "../hooks/index.ts";
import type { PublicUser } from "../types/index.ts";

export type UserFormValues = { name: string; email: string; password: string; roleKey?: string };

type UserSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create. The owner decides the save path, this stays dumb. */
  user?: PublicUser | null;
  onSave?: (values: UserFormValues) => void;
  saving?: boolean;
  canAssignRole?: boolean;
};

/** Create or edit one user. Fields are identical in both modes, so they share one form. */
export function UserSheet({ open, onOpenChange, user, onSave, saving, canAssignRole = true }: UserSheetProps) {
  const { t } = useI18n();
  const roles = useRoles();
  const createUser = useCreateUser();
  const editing = Boolean(user);
  const toast = useToast();

  const roleOptions = roles.data?.length
    ? roles.data
    : [
        { key: "owner", name: "Owner" },
        { key: "staff", name: "Staff" },
      ];

  const pending = saving || createUser.isPending;

  const form = useForm({
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      roleKey: user?.roles.find((role) => !role.scopeType)?.key ?? "staff",
    },
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {};
        if (!value.name.trim()) fields.name = t("userForm.nameRequired");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) fields.email = t("userForm.emailInvalid");
        if (!editing && value.password.length < 10) fields.password = t("userForm.passwordTooShort");
        return Object.keys(fields).length ? { fields } : undefined;
      },
    },
    onSubmit: ({ value }) => {
      const values: UserFormValues = { ...value, roleKey: value.roleKey || undefined };
      if (editing) {
        onSave?.(values);
        return;
      }
      createUser.mutate(values, {
        onSuccess: () => {
          toast.success(t("userForm.added"));
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : t("userForm.saveFailed")),
      });
    },
  });

  const heading = editing ? t("userForm.editTitle") : t("userForm.createTitle");

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title={heading}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4"
        aria-label={t("userForm.formLabel")}
      >
        <form.Subscribe selector={(state) => state.values}>
          {({ name, email, password, roleKey }) => (
            <>
              <h2 className="text-[15px] font-semibold">{heading}</h2>

              <Field id="user-name" label={t("userForm.name")}>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(e) => form.setFieldValue("name", e.target.value)}
                  required
                  maxLength={120}
                />
              </Field>

              <Field id="user-email" label={t("common.email")} hint={editing ? t("userForm.emailLocked") : undefined}>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => form.setFieldValue("email", e.target.value)}
                  required
                  disabled={editing}
                />
              </Field>

              {editing ? null : (
                <Field
                  id="user-password"
                  label={t("userForm.initialPassword")}
                  hint={t("userForm.initialPasswordHint")}
                >
                  <Input
                    id="user-password"
                    type="text"
                    value={password}
                    onChange={(e) => form.setFieldValue("password", e.target.value)}
                    required
                    minLength={10}
                    autoComplete="off"
                  />
                </Field>
              )}

              {canAssignRole ? (
                <Field id="user-role" label={t("userForm.role")}>
                  {/* A role list grows with the organisation, so it is searchable rather than scrolled. */}
                  <Combobox
                    value={roleKey}
                    onValueChange={(value) => form.setFieldValue("roleKey", value)}
                    options={roleOptions.map((r) => ({ value: r.key, label: r.name }))}
                    placeholder={t("userForm.chooseRole")}
                    searchPlaceholder={t("userForm.searchRoles")}
                    emptyMessage={t("userForm.noRolesMatch")}
                    label={t("userForm.role")}
                    testId="user-role"
                  />
                </Field>
              ) : null}

              <form.Subscribe
                selector={(state) => [
                  ...state.errors,
                  ...Object.values(state.fieldMeta).flatMap((field) => field?.errors ?? []),
                ]}
              >
                {(errors) => <FormErrors errors={errors} />}
              </form.Subscribe>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" icon={editing ? Save : UserPlus} disabled={pending}>
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
