import React from "react";
import { VideoStatus, RenditionStatus } from "@/types/video";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoStatusBadgeProps {
  status: VideoStatus | RenditionStatus;
  className?: string;
  showIcon?: boolean;
}

export function VideoStatusBadge({
  status,
  className,
  showIcon = true,
}: VideoStatusBadgeProps) {
  switch (status) {
    case "uploading":
      return (
        <Badge variant="sky" className={cn("gap-1.5 font-semibold", className)}>
          {showIcon && <Upload className="h-3 w-3 animate-bounce" />}
          <span>Uploading</span>
        </Badge>
      );

    case "queued":
      return (
        <Badge variant="amber" className={cn("gap-1.5 font-semibold", className)}>
          {showIcon && <Clock className="h-3 w-3" />}
          <span>Queued</span>
        </Badge>
      );

    case "processing":
      return (
        <Badge variant="sky" className={cn("gap-1.5 font-semibold bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/30", className)}>
          {showIcon && <Loader2 className="h-3 w-3 animate-spin text-sky-600 dark:text-sky-400" />}
          <span>Processing</span>
        </Badge>
      );

    case "ready":
      return (
        <Badge variant="emerald" className={cn("gap-1.5 font-semibold", className)}>
          {showIcon && <CheckCircle2 className="h-3 w-3" />}
          <span>Ready</span>
        </Badge>
      );

    case "failed":
      return (
        <Badge variant="rose" className={cn("gap-1.5 font-semibold", className)}>
          {showIcon && <AlertCircle className="h-3 w-3" />}
          <span>Failed</span>
        </Badge>
      );

    default:
      return (
        <Badge variant="slate" className={className}>
          <span>{status}</span>
        </Badge>
      );
  }
}
