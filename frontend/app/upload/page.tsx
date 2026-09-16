"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { VideoDropzone, SelectedFileMetadata } from "@/components/upload/video-dropzone";
import { SelectedVideoCard } from "@/components/upload/selected-video";
import { UploadProgressCard } from "@/components/upload/upload-progress";
import { VideoAPI, uploadFileToS3WithProgress } from "@/lib/api/videos";
import { UploadProgressInfo } from "@/types/video";
import { toast } from "sonner";

export default function UploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<SelectedFileMetadata | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);

  const handleStartUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress({
      progress: 0,
      bytesUploaded: 0,
      totalBytes: selectedFile.size,
      speed: "0 MB/s",
      stage: "requesting_url",
    });

    try {
      // 1. Obtain S3 Presigned Upload URL from FastAPI
      const res = await VideoAPI.createVideo({
        filename: selectedFile.name,
        size: selectedFile.size,
        duration: selectedFile.duration,
        width: selectedFile.width,
        height: selectedFile.height,
        mimeType: selectedFile.type,
      });

      const videoId = res.video_id || res.id || "";
      const uploadUrl = res.upload_url;

      const totalBytes = selectedFile.size;
      const startTime = Date.now();

      // 2. Direct browser -> S3 upload using presigned PUT URL
      if (uploadUrl) {
        setUploadProgress({
          progress: 0,
          bytesUploaded: 0,
          totalBytes,
          speed: "Starting...",
          stage: "uploading",
        });

        await uploadFileToS3WithProgress(
          uploadUrl,
          selectedFile.file,
          (percent, loaded, total) => {
            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedMb = elapsedSec > 0 ? ((loaded / (1024 * 1024)) / elapsedSec).toFixed(1) : "0.0";
            setUploadProgress({
              progress: percent,
              bytesUploaded: loaded,
              totalBytes: total,
              speed: `${speedMb} MB/s`,
              stage: "uploading",
            });
          }
        );
      } else {
        // Fallback for local demo simulation without backend S3
        const chunkSize = totalBytes / 10;
        let uploaded = 0;
        for (let i = 1; i <= 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          uploaded = Math.min(totalBytes, chunkSize * i);
          const percent = Math.round((uploaded / totalBytes) * 100);
          setUploadProgress({
            progress: percent,
            bytesUploaded: uploaded,
            totalBytes,
            speed: "24.5 MB/s",
            stage: "uploading",
          });
        }
      }

      setUploadProgress((prev: UploadProgressInfo | null) =>
        prev
          ? {
              ...prev,
              progress: 100,
              bytesUploaded: totalBytes,
              stage: "registering",
            }
          : null
      );

      // 3. Verify object in S3 via FastAPI HeadObject
      await VideoAPI.completeUpload(videoId);

      setUploadProgress((prev: UploadProgressInfo | null) =>
        prev
          ? {
              ...prev,
              stage: "complete",
            }
          : null
      );

      toast.success("Upload verified & completed! Redirecting...");

      setTimeout(() => {
        router.push(`/video/${videoId}`);
      }, 1000);

    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Upload failed. Please try again.");
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/60 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
              Upload Video Asset
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 pl-11 font-sans">
            Upload raw video files for automated processing into adaptive bitrate streams.
          </p>
        </div>
      </div>

      {/* Upload Workflow Stages */}
      {uploadProgress ? (
        <UploadProgressCard
          filename={selectedFile?.name || "video.mp4"}
          info={uploadProgress}
        />
      ) : selectedFile ? (
        <SelectedVideoCard
          metadata={selectedFile}
          onStartUpload={handleStartUpload}
          onClear={() => setSelectedFile(null)}
          isUploading={isUploading}
        />
      ) : (
        <VideoDropzone onFileSelect={setSelectedFile} />
      )}

      {/* Pipeline Note */}
      <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#111726] space-y-2 font-mono text-xs text-slate-600 dark:text-slate-400 shadow-xs">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold">
          <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span>Direct Ingestion Pipeline</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
          Videos are transferred securely and routed directly into automated processing queues for adaptive bitrate playback generation.
        </p>
      </div>
    </div>
  );
}
