import { Save, ShieldPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ApiError } from "../../lib/api.ts";
import { Button, Field, Input, Textarea } from "../../shared/ui/primitives.tsx";
import { Sheet } from "../../shared/ui/sheet.tsx";
import { useToast } from "../../shared/ui/toast.tsx";
import { useRoleStatements } from "../admin/api.ts";
import type { Role } from "../admin/types.ts";

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
  const editing = Boolean(role);
  const toast = useToast();
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ key, name, description: description || undefined }).then(
      () => {
        toast.success(editing ? "Peran diperbarui" : "Peran dibuat");
        onOpenChange(false);
      },
      (err) => toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan peran"),
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title={editing ? "Ubah Peran" : "Tambah Peran"}>
      <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Form peran">
        <h2 className="text-[15px] font-semibold">{editing ? "Ubah Peran" : "Tambah Peran"}</h2>

        <Field
          id="role-key"
          label="Kunci"
          hint={editing ? "Kunci bersifat tetap: kode dan audit mengacu padanya." : "Huruf kecil, angka, tanda hubung."}
        >
          <Input
            id="role-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            disabled={editing}
            pattern="[a-z0-9_\-]+"
            maxLength={64}
          />
        </Field>

        <Field id="role-name" label="Nama tampilan">
          <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>

        <Field id="role-description" label="Deskripsi">
          <Textarea
            id="role-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </Field>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="submit" icon={editing ? Save : ShieldPlus} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
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
  const statements = useRoleStatements(open);
  const [draft, setDraft] = useState<string[]>(role.permissions);
  const toast = useToast();
  const chosen = new Set(draft);

  const toggle = (permission: string) => {
    setDraft((prev) => (prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(draft).then(
      () => {
        toast.success("Izin peran disimpan");
        onOpenChange(false);
      },
      (err) => toast.error(err instanceof ApiError ? err.message : "Gagal menyimpan izin"),
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="right" title={`Izin — ${role.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-5" aria-label="Form izin peran">
        <div>
          <h2 className="text-[15px] font-semibold">Izin — {role.name}</h2>
          <p className="text-[12.5px] text-ink-muted">{draft.length} izin dipilih</p>
        </div>

        {statements.isPending ? (
          <p className="text-[13px] text-ink-muted">Memuat katalog…</p>
        ) : (
          Object.entries(statements.data?.statements ?? {}).map(([resource, actions]) => (
            <fieldset key={resource} className="space-y-1.5">
              <legend className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">{resource}</legend>
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
            Batal
          </Button>
          <Button type="submit" icon={Save} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan izin"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
