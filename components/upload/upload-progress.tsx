"use client";

import { UploadProgressInfo } from "@/types/video";
import { formatBytes } from "@/lib/utils";
import { Upload, Server, ArrowRight, CheckCircle2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadProgressProps {
  filename: string;
  info: UploadProgressInfo;
}

export function UploadProgressCard({ filename, info }: UploadProgressProps) {
  const { progress, bytesUploaded, totalBytes, speed, stage } = info;

  const isComplete = stage === "complete";
  const isRegistering = stage === "registering";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] p-6 md:p-8 space-y-6 font-mono shadow-sm">
      {/* Header Stage Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
              isComplete
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400"
            )}
          >
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : isRegistering ? (
              <Cpu className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5 animate-bounce" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {isComplete
                ? "Upload Complete!"
                : isRegistering
                ? "Preparing processing jobs..."
                : "Uploading video to S3 storage..."}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
              {filename}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{progress}%</span>
        </div>
      </div>

      {/* Infrastructure Terminal Progress Bar */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-950 rounded-full border border-slate-200 dark:border-slate-800 p-0.5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              isComplete
                ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                : "bg-gradient-to-r from-sky-600 via-sky-500 to-sky-400 shadow-sm shadow-sky-500/50"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Transfer Stats Footer */}
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-1">
          <div className="flex items-center gap-1.5 font-medium">
            <Server className="h-3.5 w-3.5 text-slate-400" />
            <span>
              {formatBytes(bytesUploaded)} / {formatBytes(totalBytes)}
            </span>
          </div>

          {!isComplete && (
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-sky-600 dark:text-sky-400 font-bold">{speed}</span>
            </div>
          )}
        </div>
      </div>

      {/* Direct Ingestion Banner */}
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#070a12] border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-2 font-medium">
          <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          <span>S3 Direct Multipart Transfer</span>
        </span>
        {isRegistering && (
          <span className="text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1">
            <span>Routing to Kafka Queue</span>
            <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
