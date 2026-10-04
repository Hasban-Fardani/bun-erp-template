import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@bun-erp/ui/organisms/sidebar";
import type { ReactNode } from "react";

export type SidebarBlockLink = {
  href: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
};

export function SidebarBlock({
  brand,
  links,
  children,
  header,
}: {
  brand: ReactNode;
  links: readonly SidebarBlockLink[];
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>{brand}</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.map((link) => (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={link.active} tooltip={link.label}>
                      <a href={link.href}>
                        {link.icon}
                        <span>{link.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex min-h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          {header}
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
