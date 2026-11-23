import { AppSidebarShell } from "./app-sidebar-shell"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppSidebarShell>{children}</AppSidebarShell>
}
