"use client";

import { useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { ImageUp, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { VideoAPI } from "@/lib/api/videos";
import { cn } from "@/lib/utils";

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface ThumbnailUploadButtonProps {
  videoId: string;
  filename: string;
  onPreviewSelected: (file: File) => void;
  onUploaded: (thumbnailUrl: string, thumbnailVersion: number) => void;
  onUploadFailed: () => void;
  className?: string;
  label?: string;
}

export function ThumbnailUploadButton({
  videoId,
  filename,
  onPreviewSelected,
  onUploaded,
  onUploadFailed,
  className,
  label = "Thumbnail",
}: ThumbnailUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploading) inputRef.current?.click();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP thumbnail");
      return;
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      toast.error("Thumbnail must be 5 MB or smaller");
      return;
    }

    // The playback page owns the temporary object URL so it can retain the
    // selected image until the completion response confirms the replacement.
    onPreviewSelected(file);
    setUploadProgress(0);
    setIsFinalizing(false);
    setIsUploading(true);
    try {
      const result = await VideoAPI.uploadThumbnail(videoId, file, {
        onUploadProgress: setUploadProgress,
        onFinalizing: () => {
          setUploadProgress(100);
          setIsFinalizing(true);
        },
      });
      onUploaded(result.thumbnail_url, result.thumbnail_version);
      toast.success("Custom thumbnail updated");
    } catch (error) {
      onUploadFailed();
      toast.error(error instanceof Error ? error.message : "Thumbnail upload failed");
    } finally {
      setIsUploading(false);
      setIsFinalizing(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={openFilePicker}
        disabled={isUploading}
        className={cn(
          "pointer-events-auto inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-slate-950/80 px-2 py-1.5 font-mono text-[10px] font-semibold text-white shadow-lg backdrop-blur transition-colors hover:bg-slate-900 disabled:cursor-wait",
          isUploading && "opacity-75",
          className
        )}
        title={`Replace thumbnail for ${filename}`}
        aria-label={`Replace thumbnail for ${filename}`}
      >
        {isUploading ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImageUp className="h-3.5 w-3.5" />
        )}
        <span>
          {isUploading
            ? isFinalizing
              ? "Almost done"
              : `Uploading ${uploadProgress}%`
            : label}
        </span>
      </button>

      {isUploading && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-slate-500 dark:text-slate-400">
            <span>{isFinalizing ? "Just a moment, almost done…" : "Uploading thumbnail"}</span>
            <span className="shrink-0 font-semibold text-sky-600 dark:text-sky-400">{uploadProgress}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
            role="progressbar"
            aria-label="Thumbnail upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
          >
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-[width] duration-200",
                isFinalizing && "animate-pulse"
              )}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={isUploading}
        onChange={handleFile}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
