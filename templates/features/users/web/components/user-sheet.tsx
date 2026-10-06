import { useI18n } from "@bun-erp/i18n/react";
import { Button } from "@bun-erp/ui/atoms/button.tsx";
import { Input } from "@bun-erp/ui/atoms/input.tsx";
import { Field } from "@bun-erp/ui/molecules/field.tsx";
import { FormFieldError } from "@bun-erp/ui/molecules/form-errors.tsx";
import { Combobox } from "@bun-erp/ui/organisms/combobox.tsx";
import { Sheet } from "@bun-erp/ui/organisms/sheet.tsx";
import { useToast } from "@bun-erp/ui/organisms/toast.tsx";
import { isValidEmailAddress } from "@bun-erp/utils/email";
import { useForm } from "@tanstack/react-form";
import { Eye, EyeOff, Save, UserPlus } from "lucide-react";
import { useState } from "react";
import { ApiError } from "../../../lib/api.ts";
import { useCreateUser, useRoles } from "../hooks/index.ts";
import type { PublicUser } from "../types/index.ts";

type UserFormValues = { name: string; email: string; password: string; roleKey?: string };

type UserSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create. The owner decides the save path, this stays dumb. */
  user?: PublicUser | null;
  onSave?: (values: UserFormValues) => void;
  saving?: boolean;
  canAssignRole?: boolean;
};

/** Create or edit one user with field-level validation and accessible password visibility. */
export function UserSheet({ open, onOpenChange, user, onSave, saving, canAssignRole = true }: UserSheetProps) {
  const { t } = useI18n();
  const roles = useRoles();
  const createUser = useCreateUser();
  const editing = Boolean(user);
  const toast = useToast();
  const [passwordVisible, setPasswordVisible] = useState(false);

  const roleOptions = roles.data?.length
    ? roles.data
    : [
        { key: "owner", name: "Owner" },
        { key: "staff", name: "Staff" },
      ];

  const pending = saving || createUser.isPending;
  const validateName = (value: string) => (value.trim() ? undefined : t("userForm.nameRequired"));
  const validateEmail = (value: string) => (isValidEmailAddress(value) ? undefined : t("userForm.emailInvalid"));
  const validatePassword = (value: string) => (value.length >= 10 ? undefined : t("userForm.passwordTooShort"));

  const form = useForm({
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      roleKey: user?.roles.find((role) => !role.scopeType)?.key ?? "staff",
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
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : t("userForm.saveFailed");
          const details = err instanceof ApiError ? err.fields?.map(({ path, message }) => `${path}: ${message}`) : [];
          toast.error(details?.length ? `${message}: ${details.join("; ")}` : message);
        },
      });
    },
  });

  const heading = editing ? t("userForm.editTitle") : t("userForm.createTitle");

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title={heading}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4"
        aria-label={t("userForm.formLabel")}
        aria-busy={pending}
      >
        <h2 className="text-[15px] font-semibold">{heading}</h2>

        <form.Field
          name="name"
          validators={{
            onBlur: ({ value }) => validateName(value),
            onChange: ({ value, fieldApi }) => (fieldApi.state.meta.isTouched ? validateName(value) : undefined),
            onSubmit: ({ value }) => validateName(value),
          }}
        >
          {(field) => {
            const errorId = "user-name-error";
            const invalid = field.state.meta.errors.length > 0;
            return (
              <Field id="user-name" label={t("userForm.name")}>
                <Input
                  id="user-name"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? errorId : undefined}
                />
                <FormFieldError id={errorId} errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        <form.Field
          name="email"
          validators={{
            onBlur: ({ value }) => validateEmail(value),
            onChange: ({ value, fieldApi }) => (fieldApi.state.meta.isTouched ? validateEmail(value) : undefined),
            onSubmit: ({ value }) => validateEmail(value),
          }}
        >
          {(field) => {
            const errorId = "user-email-error";
            const invalid = field.state.meta.errors.length > 0;
            return (
              <Field id="user-email" label={t("common.email")} hint={editing ? t("userForm.emailLocked") : undefined}>
                <Input
                  id="user-email"
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoComplete="username"
                  disabled={editing}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? errorId : undefined}
                />
                <FormFieldError id={errorId} errors={field.state.meta.errors} />
              </Field>
            );
          }}
        </form.Field>

        {editing ? null : (
          <form.Field
            name="password"
            validators={{
              onBlur: ({ value }) => validatePassword(value),
              onChange: ({ value, fieldApi }) => (fieldApi.state.meta.isTouched ? validatePassword(value) : undefined),
              onSubmit: ({ value }) => validatePassword(value),
            }}
          >
            {(field) => {
              const errorId = "user-password-error";
              const invalid = field.state.meta.errors.length > 0;
              return (
                <Field
                  id="user-password"
                  label={t("userForm.initialPassword")}
                  hint={t("userForm.initialPasswordHint")}
                >
                  <div className="relative">
                    <Input
                      id="user-password"
                      name={field.name}
                      type={passwordVisible ? "text" : "password"}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      required
                      minLength={10}
                      maxLength={200}
                      autoComplete="new-password"
                      className="pr-10"
                      aria-invalid={invalid}
                      aria-describedby={invalid ? errorId : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      aria-label={passwordVisible ? t("auth.hidePassword") : t("auth.showPassword")}
                      aria-pressed={passwordVisible}
                      className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center rounded-r-md text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
                    >
                      {passwordVisible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  <FormFieldError id={errorId} errors={field.state.meta.errors} />
                </Field>
              );
            }}
          </form.Field>
        )}

        {canAssignRole ? (
          <form.Field name="roleKey">
            {(field) => (
              <Field id="user-role" label={t("userForm.role")}>
                {/* A role list grows with the organisation, so it is searchable rather than scrolled. */}
                <Combobox
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  options={roleOptions.map((role) => ({ value: role.key, label: role.name }))}
                  placeholder={t("userForm.chooseRole")}
                  searchPlaceholder={t("userForm.searchRoles")}
                  emptyMessage={t("userForm.noRolesMatch")}
                  label={t("userForm.role")}
                  testId="user-role"
                />
              </Field>
            )}
          </form.Field>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" icon={editing ? Save : UserPlus} disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
