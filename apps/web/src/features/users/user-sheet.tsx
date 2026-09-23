import { Save, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ApiError } from "../../lib/api.ts";
import { Button, Field, Input } from "../../shared/ui/primitives.tsx";
import { SimpleSelect } from "../../shared/ui/select.tsx";
import { Sheet } from "../../shared/ui/sheet.tsx";
import { useToast } from "../../shared/ui/toast.tsx";
import { useCreateUser, useRoles } from "./api.ts";
import type { PublicUser } from "./types.ts";

export type UserFormValues = { name: string; email: string; password: string; roleKey?: string };

type UserSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode; absent = create. The owner decides the save path, this stays dumb. */
  user?: PublicUser | null;
  onSave?: (values: UserFormValues) => void;
  saving?: boolean;
};

/** Create or edit one user. Fields are identical in both modes, so they share one form. */
export function UserSheet({ open, onOpenChange, user, onSave, saving }: UserSheetProps) {
  const roles = useRoles();
  const createUser = useCreateUser();
  const editing = Boolean(user);
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleKey, setRoleKey] = useState(user?.roles[0]?.key ?? "staff");

  const roleOptions = roles.data?.length
    ? roles.data
    : [
        { key: "owner", name: "Owner" },
        { key: "staff", name: "Staff" },
      ];

  const pending = saving || createUser.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    toast.error("");
    const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan pengguna");
    const values: UserFormValues = { name, email, password, roleKey: roleKey || undefined };

    if (editing) {
      onSave?.(values);
      return;
    }
    createUser.mutate(values, {
      onSuccess: () => {
        toast.success("Pengguna ditambahkan");
        onOpenChange(false);
      },
      onError: fail,
    });
  };

  const heading = editing ? "Ubah Pengguna" : "Tambah Pengguna";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title={heading}>
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Form pengguna">
        <h2 className="text-[15px] font-semibold">{heading}</h2>

        <Field id="user-name" label="Nama">
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>

        <Field id="user-email" label="Email" hint={editing ? "Email tidak dapat diubah dari sini." : undefined}>
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={editing}
          />
        </Field>

        {editing ? null : (
          <Field id="user-password" label="Sandi awal" hint="Minimal 10 karakter; pengguna dapat menggantinya nanti.">
            <Input
              id="user-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="off"
            />
          </Field>
        )}

        <Field id="user-role" label="Peran">
          {/* A role list grows with the organisation, so it is searchable rather than scrolled. */}
          <SimpleSelect
            value={roleKey}
            onValueChange={setRoleKey}
            options={roleOptions.map((r) => ({ value: r.key, label: r.name }))}
            label="Peran"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="submit" icon={editing ? Save : UserPlus} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
