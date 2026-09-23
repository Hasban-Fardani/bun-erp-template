import { useSystemStatus } from "../../features/health/api.ts";

/**
 * Degraded-backend notice for the login screen.
 *
 * This says nothing while the system is healthy. Announcing good news on every visit turns a
 * status line into decoration; the only moment it has information is when signing in cannot
 * work. It therefore renders nothing at all in the normal case.
 */
export function SystemStatusStrip() {
  const status = useSystemStatus();

  if (status.isPending || !status.data) return null;

  const { api, database } = status.data;
  if (api && database) return null;

  const detail = api
    ? "Basis data belum menjawab. Masuk akan gagal sampai layanan pulih."
    : "Layanan tidak terjangkau. Periksa koneksi Anda, lalu coba lagi.";

  return (
    <p
      role="status"
      aria-live="polite"
      className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
    >
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
      {detail}
    </p>
  );
}
