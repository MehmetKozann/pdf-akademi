import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicSystemStatus } from "@/lib/config/server-config";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/giris");
  }

  const system = getPublicSystemStatus();

  return (
    <DashboardShell
      user={user}
      aiConfigured={system.aiConfigured}
      activeProvider={system.activeProvider}
    >
      {children}
    </DashboardShell>
  );
}

