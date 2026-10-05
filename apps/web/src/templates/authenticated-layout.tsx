import { LocaleSwitcher, useI18n } from "@bun-erp/i18n/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@bun-erp/ui/molecules/breadcrumb.tsx";
import { Tooltip } from "@bun-erp/ui/molecules/tooltip.tsx";
import * as UserMenu from "@bun-erp/ui/organisms/dropdown-menu.tsx";
import { Sheet } from "@bun-erp/ui/organisms/sheet.tsx";
import { Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen, Users as UsersIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { type NavItem, navLocationForPath, visibleNavGroups } from "../config/navigation.ts";
import { uiConfig } from "../config/ui.ts";
import { useSession, useSignOut } from "../features/identity/hooks/index.ts";
import { NotificationsBell } from "../features/notifications/components/notification-bell.tsx";
import { cn } from "../lib/cn.ts";
import { CommandPalette } from "./command-palette.tsx";
import { ThemeSwitcher } from "./theme-switcher.tsx";

type SessionData = Awaited<ReturnType<typeof useSession>>["data"];

const COLLAPSE_KEY = "erp.sidebar.collapsed";

/** Collapse preference survives reloads; read lazily so SSR never touches localStorage. */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  return [
    collapsed,
    (next: boolean) => {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      setCollapsed(next);
    },
  ] as const;
}

function NavigationGroup({
  items,
  titleKey,
  collapsed,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  titleKey?: NavItem["titleKey"];
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const [focusedUrl, setFocusedUrl] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const activeUrl = items.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))?.url;
  const targetUrl = hoveredUrl ?? focusedUrl ?? activeUrl;

  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container || !targetUrl) {
      setIndicator(null);
      return;
    }

    const measure = () => {
      const target = itemRefs.current.get(targetUrl);
      if (!target || !listRef.current) return;
      const containerBounds = listRef.current.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const next = { top: targetBounds.top - containerBounds.top, height: targetBounds.height };
      setIndicator((previous) =>
        previous && Math.abs(previous.top - next.top) < 0.5 && Math.abs(previous.height - next.height) < 0.5
          ? previous
          : next,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [targetUrl]);

  return (
    <div className="mb-5">
      {titleKey && !collapsed ? (
        <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">{t(titleKey)}</p>
      ) : null}
      <div ref={listRef} className="relative">
        {indicator ? (
          <span
            aria-hidden="true"
            data-nav-indicator="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-0 rounded-md",
              "transition-[transform,height,background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
              targetUrl === activeUrl ? "bg-accent shadow-sm" : "bg-accent-soft",
            )}
            style={{ height: indicator.height, transform: `translateY(${indicator.top}px)` }}
          />
        ) : null}
        <ul className="relative z-10 space-y-0.5" onPointerLeave={() => setHoveredUrl(null)}>
          {items.map((item) => {
            const active = item.url === activeUrl;
            const highlighted = item.url === targetUrl;
            const title = t(item.titleKey);
            const link = (
              <Link
                to={item.url}
                ref={(node) => {
                  if (node) itemRefs.current.set(item.url, node);
                  else itemRefs.current.delete(item.url);
                }}
                onClick={onNavigate}
                onPointerEnter={() => setHoveredUrl(item.url)}
                onFocus={() => setFocusedUrl(item.url)}
                onBlur={(event) => {
                  if (!listRef.current?.contains(event.relatedTarget as Node | null)) setFocusedUrl(null);
                }}
                aria-current={active ? "page" : undefined}
                data-nav-item={item.url}
                className={cn(
                  "flex items-center rounded-md text-[13.5px] font-medium outline-none transition-colors duration-150 ease-out motion-reduce:transition-none",
                  "focus-visible:ring-2 focus-visible:ring-accent",
                  collapsed ? "h-10 w-full justify-center px-0" : "gap-2.5 px-2 py-2",
                  highlighted
                    ? active
                      ? "text-accent-ink"
                      : "text-accent-soft-foreground"
                    : active
                      ? "font-semibold text-accent"
                      : "text-ink-soft",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {collapsed ? <span className="sr-only">{title}</span> : title}
              </Link>
            );
            return (
              <li key={item.url}>
                {collapsed ? (
                  <Tooltip label={title} side="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function NavContent({
  session,
  onNavigate,
  collapsed = false,
}: {
  session: SessionData;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { t } = useI18n();
  const location = useLocation();
  return (
    <nav className="flex h-full flex-col" aria-label={t("navigation.primary")}>
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 border-b border-border",
          collapsed ? "justify-center px-0" : "px-4",
        )}
      >
        <Link
          to="/"
          aria-label={t("navigation.home")}
          className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink">
            <UsersIcon className="size-4" />
          </span>
          {/* Rail mode: the app name drops out, icons stay as position markers. */}
          {collapsed ? null : (
            <span className="truncate text-[14.5px] font-semibold tracking-tight">{uiConfig.appName}</span>
          )}
        </Link>
      </div>

      <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {visibleNavGroups(session?.permissions ?? []).map((group) => (
          <NavigationGroup
            key={group.titleKey ?? "primary"}
            titleKey={group.titleKey}
            items={group.items}
            collapsed={collapsed}
            pathname={location.pathname}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

/**
 * Where you are, for the administration subpages. The sidebar names the group, but once a page
 * is open the header repeats the trail. Home has no group, so it renders nothing rather than a
 * lone crumb.
 */
function Breadcrumbs({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const location = navLocationForPath(pathname);
  if (!location?.group.titleKey) return null;
  return (
    <Breadcrumb className="hidden min-w-0 md:block">
      <BreadcrumbList className="flex-nowrap text-[12.5px]">
        <BreadcrumbItem>
          <span className="truncate text-ink-muted">{t(location.group.titleKey)}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="truncate">{t(location.item.titleKey)}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function Topbar({ session }: { session: SessionData }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useCollapsed();
  const signOut = useSignOut();
  const location = useLocation();
  const { t } = useI18n();

  return (
    <>
      {/* Desktop: collapses into an icon rail; mobile: full drawer. */}
      <aside
        data-sidebar-collapsed={collapsed}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <NavContent session={session} collapsed={collapsed} />
      </aside>

      <Sheet
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title={t("navigation.primary")}
        titleHidden
        className="lg:hidden"
      >
        <NavContent session={session} onNavigate={() => setMobileOpen(false)} />
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={t("navigation.openMenu")}
            className="rounded-md p-1.5 text-ink-soft outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t("navigation.expandSidebar") : t("navigation.collapseSidebar")}
            aria-expanded={!collapsed}
            className="hidden rounded-md p-1.5 text-ink-soft outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>

          <Breadcrumbs pathname={location.pathname} />

          <div className="ml-auto flex items-center gap-1.5">
            <CommandPalette permissions={session?.permissions ?? []} onSignOut={() => signOut.mutate()} />
            <NotificationsBell />
            <span className="hidden sm:block">
              <ThemeSwitcher />
            </span>
            <LocaleSwitcher className="h-8 max-w-32 rounded-md border border-border bg-surface px-2 text-xs text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-accent" />
            <UserMenu.Root>
              <UserMenu.Trigger className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-accent">
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-soft-foreground">
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
                <UserMenu.Item onSelect={() => signOut.mutate()}>{t("navigation.signOut")}</UserMenu.Item>
              </UserMenu.Content>
            </UserMenu.Root>
          </div>
        </header>
        <main key={location.pathname} id="main-content" className="enter-soft flex-1">
          <Outlet />
        </main>
      </div>
    </>
  );
}

export function AuthenticatedLayout() {
  const session = useSession();
  const { t } = useI18n();

  if (session.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[13px] text-ink-muted">{t("common.loading")}</div>
    );
  }
  if (!session.data?.authenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-ink focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("navigation.skipToContent")}
      </a>
      <Topbar session={session.data} />
    </div>
  );
}
