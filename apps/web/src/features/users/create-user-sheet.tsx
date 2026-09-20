import { type FormEvent, useState } from "react";
import { ApiError } from "../../lib/api.ts";
import { Button, Input } from "../../shared/ui/primitives.tsx";
import { Sheet } from "../../shared/ui/sheet.tsx";
import { useCreateUser, useRoles } from "./api.ts";

/** Form tambah pengguna; dipisah dari halaman agar komponen daftar tetap tipis. */
export function CreateUserSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const roles = useRoles();
  const createUser = useCreateUser();
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleKey, setRoleKey] = useState("staff");

  const roleOptions = roles.data?.length
    ? roles.data
    : [
        { key: "owner", name: "Owner" },
        { key: "staff", name: "Staff" },
      ];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    createUser.mutate(
      { name, email, password, roleKey: roleKey || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setName("");
          setEmail("");
          setPassword("");
          setRoleKey("staff");
        },
        onError: (err) => setFormError(err instanceof ApiError ? err.message : "Gagal menambah pengguna"),
      },
    );
  };

  const field = "flex flex-col gap-1.5 text-[12.5px] font-medium text-ink-soft";

  return (
    <Sheet open={open} onOpenChange={onOpenChange} className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Form tambah pengguna">
        <h2 className="text-[15px] font-semibold">Tambah Pengguna</h2>

        <label htmlFor="user-name" className={field}>
          Nama
          <Input
            id="user-name"
            className="w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>

        <label htmlFor="user-email" className={field}>
          Email
          <Input
            id="user-email"
            className="w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label htmlFor="user-password" className={field}>
          Sandi awal (min. 10 karakter)
          <Input
            id="user-password"
            className="w-full"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="off"
          />
        </label>

        <label htmlFor="user-role" className={field}>
          Peran
          <select
            id="user-role"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[13.5px] text-ink outline-none focus:border-accent"
            value={roleKey}
            onChange={(e) => setRoleKey(e.target.value)}
          >
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        {formError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {formError}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
