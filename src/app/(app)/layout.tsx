import { requireUser } from "@/shared/auth";
import { AppSidebar } from "@/shared/components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex h-dvh">
      <AppSidebar user={{ name: user.name, role: user.role }} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
