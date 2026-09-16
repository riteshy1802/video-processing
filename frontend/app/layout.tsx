import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Transcode.io | Distributed Video Processing & Transcoding",
  description:
    "Professional distributed video transcoding and adaptive bitrate streaming platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark antialiased`}
    >
      <body className="h-full bg-slate-950 text-slate-100 flex flex-row overflow-hidden font-sans">
        <SidebarProvider>
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
            <Header />
            <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
              {children}
            </main>
          </div>
        </SidebarProvider>

        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0f172a",
              border: "1px solid #1e293b",
              color: "#f8fafc",
            },
          }}
        />
      </body>
    </html>
  );
}
