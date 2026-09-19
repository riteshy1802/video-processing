'use client';

import { usePathname } from 'next/navigation';
import { SidebarProvider } from '@/components/layout/sidebar-provider';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDocs = pathname?.startsWith('/docs');

  if (isDocs) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100">
      <SidebarProvider>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
          <Header />
          <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}
