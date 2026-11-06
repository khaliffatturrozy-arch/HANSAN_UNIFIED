import { requirePageSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  return <AppShell actor={session.actor}>{children}</AppShell>;
}
