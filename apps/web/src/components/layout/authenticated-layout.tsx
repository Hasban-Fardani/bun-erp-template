import { Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { Menu, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { useSession, useSignOut } from "../../features/users/api.ts";
import { cn } from "../../lib/cn.ts";
import { UserMenu } from "../../shared/ui/dropdown-menu.tsx";
import { Sheet } from "../../shared/ui/sheet.tsx";
import { navGroups } from "./sidebar-data.ts";

type SessionData = Awaited<ReturnType<typeof useSession>>["data"];

function hasPermission(session: SessionData, permission?: string): boolean {
  if (!permission) return true;
  return session?.permissions.includes(permission) ?? false;
}

function NavContent({ session, onNavigate }: { session: SessionData; onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-ink">
          <UsersIcon className="size-4" />
        </span>
        <span className="text-[14.5px] font-semibold tracking-tight">ERP Template</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => hasPermission(session, item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="mb-5">
              {group.title ? (
                <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                  {group.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
                  return (
                    <li key={item.url}>
                      <Link
                        to={item.url}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-2 text-[13.5px] font-medium outline-none transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-accent/40",
                          active ? "bg-accent-soft text-accent-ink" : "text-ink-soft hover:bg-background",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function Topbar({ session }: { session: SessionData }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const signOut = useSignOut();

  return (
    <>
      {/* Sidebar desktop: kolom tetap; mobile: tersembunyi, diganti drawer. */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-border bg-surface lg:block">
        <NavContent session={session} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen} className="lg:hidden">
        <NavContent session={session} onNavigate={() => setMobileOpen(false)} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
            className="rounded-md p-1.5 text-ink-soft outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="ml-auto flex items-center">
            <UserMenu.Root>
              <UserMenu.Trigger className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent/40">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">
                  {(session?.user?.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-[13px] font-medium text-ink sm:block">{session?.user?.name}</span>
              </UserMenu.Trigger>
              <UserMenu.Content>
                <div className="px-2 py-1.5">
                  <p className="text-[13px] font-medium">{session?.user?.name}</p>
                  <p className="truncate text-[12px] text-ink-muted">{session?.user?.email}</p>
                </div>
                <UserMenu.Separator />
                <UserMenu.Item onSelect={() => signOut.mutate()}>Keluar</UserMenu.Item>
              </UserMenu.Content>
            </UserMenu.Root>
          </div>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </>
  );
}

export function AuthenticatedLayout() {
  const session = useSession();

  if (session.isPending) {
    return <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">Memuat…</div>;
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-dvh bg-background">
      <Topbar session={session.data} />
    </div>
  );
}
