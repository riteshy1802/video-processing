"use client";

import { useCallback, useState } from "react";
import { FileRejection, useDropzone } from "react-dropzone";
import { Upload, FileVideo, AlertCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectedFileMetadata {
  file: File;
  name: string;
  size: number;
  type: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface VideoDropzoneProps {
  onFileSelect: (metadata: SelectedFileMetadata) => void;
  disabled?: boolean;
}

export function VideoDropzone({ onFileSelect, disabled = false }: VideoDropzoneProps) {
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      setError(null);
      setIsReading(true);

      const videoElement = document.createElement("video");
      videoElement.preload = "metadata";

      const objectUrl = URL.createObjectURL(file);

      videoElement.onloadedmetadata = () => {
        setIsReading(false);
        onFileSelect({
          file,
          name: file.name,
          size: file.size,
          type: file.type || "video/mp4",
          duration: Math.round(videoElement.duration),
          width: videoElement.videoWidth,
          height: videoElement.videoHeight,
        });
        URL.revokeObjectURL(objectUrl);
      };

      videoElement.onerror = () => {
        setIsReading(false);
        onFileSelect({
          file,
          name: file.name,
          size: file.size,
          type: file.type || "video/mp4",
        });
        URL.revokeObjectURL(objectUrl);
      };

      videoElement.src = objectUrl;
    },
    [onFileSelect]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        setError("Invalid file type. Please upload a valid video file (MP4, MOV, MKV, WebM).");
        return;
      }

      if (acceptedFiles.length > 0) {
        processFile(acceptedFiles[0]);
      }
    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/*": [".mp4", ".mov", ".mkv", ".webm", ".m4v", ".mpeg", ".mpg"],
    },
    maxFiles: 1,
    disabled: disabled || isReading,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-8 md:p-12 text-center flex flex-col items-center justify-center transition-all duration-200 cursor-pointer overflow-hidden shadow-xs",
          isDragActive
            ? "border-sky-500 bg-sky-50 dark:bg-sky-500/10 shadow-lg shadow-sky-500/10 scale-[1.01]"
            : "border-slate-300 dark:border-slate-800 bg-white dark:bg-[#111726] hover:border-sky-400 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/60",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div
            className={cn(
              "h-16 w-16 rounded-2xl border flex items-center justify-center transition-all duration-200 shadow-sm",
              isDragActive
                ? "bg-sky-600 text-white border-sky-400 scale-110"
                : "bg-sky-50 dark:bg-slate-900 border-sky-200 dark:border-slate-800 text-sky-600 dark:text-sky-400"
            )}
          >
            {isReading ? (
              <Sparkles className="h-7 w-7 animate-spin text-sky-600 dark:text-sky-400" />
            ) : (
              <Upload className="h-7 w-7" />
            )}
          </div>

          <div className="space-y-1.5 max-w-md">
            <h3 className="font-sans text-base font-semibold text-slate-900 dark:text-slate-100">
              {isDragActive
                ? "Drop your video file here"
                : isReading
                ? "Analyzing video metadata..."
                : "Drag & drop your video file"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Supports <span className="font-mono font-medium text-slate-700 dark:text-slate-300">MP4, MOV, MKV, WebM, M4V, MPEG</span> up to 5GB
            </p>
          </div>

          <div className="pt-2">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 border border-slate-800 dark:border-slate-700 font-mono text-xs font-semibold text-white dark:text-slate-200 hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer">
              <FileVideo className="h-4 w-4 text-sky-400" />
              <span>Click to Browse Files</span>
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
