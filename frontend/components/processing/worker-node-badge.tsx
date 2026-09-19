import React from "react";
import { RenditionStatus } from "@/types/video";
import { Cpu, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkerNodeBadgeProps {
  status: RenditionStatus;
  workerId?: string;
  className?: string;
}

export function WorkerNodeBadge({ status, workerId, className }: WorkerNodeBadgeProps) {
  const formattedWorker = workerId
    ? workerId.replace("worker-", "Worker-")
    : "Worker-Pool";

  const statusLower = (status || "").toLowerCase();

  if (statusLower === "processing") {
    return (
      <div className={cn("inline-flex min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-md font-mono font-bold bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/30 shadow-xs", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-ping shrink-0" />
        <Cpu className="h-3 w-3 shrink-0" />
        <span
          className="max-w-36 truncate text-[9px]"
          title={`Processing · ${formattedWorker}`}
        >
          Processing · {formattedWorker}
        </span>
      </div>
    );
  }

  if (statusLower === "queued" || statusLower === "pending") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30", className)}>
        <Clock className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>Queued in Kafka</span>
      </div>
    );
  }

  if (statusLower === "ready" || statusLower === "completed") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30", className)}>
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span>Ready · {formattedWorker}</span>
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30", className)}>
      <AlertCircle className="h-3 w-3 shrink-0" />
      <span>Failed</span>
    </div>
  );
}
