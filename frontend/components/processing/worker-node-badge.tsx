import React from "react";
import { RenditionStatus } from "@/types/video";
import { Cpu, Clock, CheckCircle2, AlertCircle, Ban, XCircle, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkerNodeBadgeProps {
  status: RenditionStatus | string;
  workerId?: string;
  workerDisplay?: string;
  className?: string;
}

export function WorkerNodeBadge({ status, workerId, workerDisplay, className }: WorkerNodeBadgeProps) {
  const statusLower = (status || "").toLowerCase();
  const displayLabel = workerDisplay || workerId || "";
  const isWaiting = displayLabel === "Waiting for worker" || displayLabel === "No workers" || !displayLabel;

  if (displayLabel === "Scheduled for retry" || displayLabel.startsWith("Recovering")) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30", className)}>
        <Clock className="h-3 w-3 shrink-0" />
        <span>{displayLabel.startsWith("Recovering") ? "Recovering" : "Retrying"}</span>
      </div>
    );
  }

  if (statusLower === "processing") {
    if (isWaiting || displayLabel === "Waiting for worker") {
      return (
        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30", className)}>
          <Clock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>In Progress · Awaiting Worker</span>
        </div>
      );
    }

    return (
      <div className={cn("inline-flex min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30 shadow-xs", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-ping shrink-0" />
        <Cpu className="h-3 w-3 shrink-0" />
        <span
          className="max-w-full truncate text-[11px]"
          title={`Processing · ${displayLabel}`}
        >
          Processing · {displayLabel}
        </span>
      </div>
    );
  }

  if (statusLower === "ready" || statusLower === "completed") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30", className)}>
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span>Ready</span>
      </div>
    );
  }

  if (statusLower === "failed") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30", className)}>
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>Failed</span>
      </div>
    );
  }

  if (statusLower === "cancelled") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30", className)}>
        <XCircle className="h-3 w-3 shrink-0" />
        <span>Cancelled</span>
      </div>
    );
  }

  if (statusLower === "uploading_s3" || statusLower === "uploading to s3" || displayLabel === "Uploading to S3") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 shadow-xs", className)}>
        <Database className="h-3 w-3 shrink-0 text-emerald-500 dark:text-emerald-400 animate-pulse" />
        <span>Uploading to S3</span>
      </div>
    );
  }

  if (statusLower === "cancelling") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700", className)}>
        <Ban className="h-3 w-3 shrink-0" />
        <span>Stopping</span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80", className)}>
      <Clock className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
      <span>Queued</span>
    </div>
  );
}
