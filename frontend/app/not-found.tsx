"use client";

import Link from "next/link";
import { ArrowRight, Film, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#070a12] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-md w-full space-y-6">
        {/* Large 404 Header */}
        <h1 className="text-8xl sm:text-9xl font-black tracking-tighter font-mono bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
          404
        </h1>

        {/* Title & Message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Page Not Found
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            The page or video asset you are looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        {/* CTA Navigation Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button variant="primary" size="md" className="w-full">
              <Film className="h-4 w-4" />
              <span>Go to Video Library</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>

          <Link href="/" className="w-full sm:w-auto">
            <Button variant="outline" size="md" className="w-full">
              <Home className="h-4 w-4" />
              <span>Back to Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
