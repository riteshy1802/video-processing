"use client";

import { SelectedFileMetadata } from "./video-dropzone";
import { formatBytes, formatDuration, getResolutionLabel, getExpectedRenditions } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  FileVideo, 
  HardDrive, 
  Clock, 
  Maximize2, 
  Upload, 
  X,
  Layers,
  Sparkles 
} from "lucide-react";

interface SelectedVideoProps {
  metadata: SelectedFileMetadata;
  onStartUpload: () => void;
  onClear: () => void;
  isUploading?: boolean;
}

export function SelectedVideoCard({
  metadata,
  onStartUpload,
  onClear,
  isUploading = false,
}: SelectedVideoProps) {
  const resolutionLabel = getResolutionLabel(metadata.width, metadata.height);
  const expectedRenditions = getExpectedRenditions(metadata.height);
  const renditionsText = `Will generate ${expectedRenditions.join(", ")} HLS renditions`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] p-6 space-y-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <FileVideo className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
              {metadata.name}
            </h3>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              Ready for S3 Direct Ingestion
            </p>
          </div>
        </div>

        {!isUploading && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Remove selected video"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Technical Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#070a12] border border-slate-200 dark:border-slate-800/80 font-mono text-xs">
        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <HardDrive className="h-3 w-3" /> File Size
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100">{formatBytes(metadata.size)}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <Clock className="h-3 w-3" /> Duration
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100">
            {formatDuration(metadata.duration)}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <Maximize2 className="h-3 w-3" /> Resolution
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100">{resolutionLabel}</p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 font-semibold">
            <Layers className="h-3 w-3" /> Format
          </span>
          <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{metadata.type}</p>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="text-xs text-slate-600 dark:text-slate-400 font-mono flex items-center gap-2 font-medium">
          <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <span>{renditionsText}</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {!isUploading && (
            <Button
              variant="outline"
              size="md"
              onClick={onClear}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={onStartUpload}
            isLoading={isUploading}
            className="w-full sm:w-auto min-w-36"
          >
            <Upload className="h-4 w-4" />
            <span>Start Upload</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
