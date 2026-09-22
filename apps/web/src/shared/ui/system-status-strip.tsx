import { CheckCircle2, Database, Loader2, ServerCrash, ShieldCheck } from "lucide-react";
import { useSystemStatus } from "../../features/health/api.ts";
import { StatusPill } from "./status-pill.tsx";

/**
 * The system status strip on the login screen. Sixteen entry screens were measured in a browser
 * (docs/riset/login-entry-screens.md): all are single centred columns, so a centred card is not
 * what makes an entry screen dull — density is.
 *
 * This strip is the authored device that split-screen logins get from a decorative panel. A
 * template cannot show customer logos or uptime without inventing them; it can show whether the
 * API answers and whether the database behind it is ready. On an internal tool that is worth
 * knowing before typing a password, and it fabricates nothing.
 */
export function SystemStatusStrip() {
  const status = useSystemStatus();

  if (status.isPending) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        <StatusPill icon={Loader2} label="Memeriksa sistem…" />
      </div>
    );
  }

  const api = status.data?.api ?? false;
  const database = status.data?.database ?? false;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        {/* Healthy state stays neutral on purpose: three green pills would compete with the
            one action that matters. The strip is meant to be loud only when it has news. */}
        <StatusPill
          icon={api ? CheckCircle2 : ServerCrash}
          tone={api ? "neutral" : "danger"}
          label={api ? "API aktif" : "API tidak terjangkau"}
        />
        <StatusPill
          icon={Database}
          tone={database ? "neutral" : "danger"}
          label={database ? "Basis data siap" : "Basis data belum siap"}
        />
        <StatusPill icon={ShieldCheck} label="Sesi cookie" />
      </div>

      {api && database ? null : (
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          Masuk kemungkinan gagal sampai layanan kembali siap. Hubungi pengelola sistem bila berlanjut.
        </p>
      )}
    </div>
  );
}
