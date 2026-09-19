import { RootProvider } from 'fumadocs-ui/provider/next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import { Layers, ArrowLeft } from 'lucide-react';
import { ThemeSwitch } from 'fumadocs-ui/layouts/shared/slots/theme-switch';
import Link from 'next/link';

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        defaultTheme: 'dark',
      }}
    >
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <span className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center">
                <Layers className="h-3.5 w-3.5 text-sky-400" />
              </span>
              <span className="font-mono font-bold text-sm tracking-tight">
                Documentation
              </span>
            </span>
          ),
          transparentMode: 'none',
        }}
        sidebar={{
          banner: (
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fd-muted-foreground hover:text-fd-foreground hover:bg-fd-accent/50 rounded-lg border border-fd-border transition-colors w-full my-1 group"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-sky-400 group-hover:-translate-x-0.5 transition-transform" />
              Back to App Dashboard
            </Link>
          ),
          footer: (
            <div className="flex items-center justify-between w-full px-1 py-1.5 border-t border-fd-border/50">
              <span className="text-xs font-mono font-medium text-fd-muted-foreground">Theme</span>
              <ThemeSwitch mode="light-dark" />
            </div>
          ),
        }}
        themeSwitch={{ enabled: false }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
