import { Save, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ApiError } from "../../lib/api.ts";
import { Button, Field, Input, Select } from "../../shared/ui/primitives.tsx";
import { Sheet } from "../../shared/ui/sheet.tsx";
import { useCreateUser, useRoles, useUpdateUser } from "./api.ts";
import type { PublicUser } from "./types.ts";

/**
 * Satu formulir untuk tambah & ubah: field-nya identik, hanya jalur simpan yang beda.
 * `user` kosong = mode tambah.
 */
export function UserSheet({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: PublicUser | null;
}) {
  const roles = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const editing = Boolean(user);

  const [formError, setFormError] = useState("");
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

  const pending = createUser.isPending || updateUser.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    const done = () => onOpenChange(false);
    const fail = (err: unknown) => setFormError(err instanceof ApiError ? err.message : "Gagal menyimpan pengguna");

    if (editing && user) {
      updateUser.mutate({ id: user.id, name, roleKey }, { onSuccess: done, onError: fail });
      return;
    }
    createUser.mutate({ name, email, password, roleKey: roleKey || undefined }, { onSuccess: done, onError: fail });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title={editing ? "Ubah Pengguna" : "Tambah Pengguna"}>
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Form pengguna">
        <h2 className="text-[15px] font-semibold">{editing ? "Ubah Pengguna" : "Tambah Pengguna"}</h2>

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
          <Select id="user-role" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>

        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
          >
            {formError}
          </p>
        ) : null}

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
