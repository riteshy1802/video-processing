export type VideoStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type RenditionStatus =
  | "queued"
  | "processing"
  | "ready"
  | "failed";

export type ResolutionType = "144p" | "480p" | "720p" | "1080p";

export interface Rendition {
  resolution: ResolutionType;
  status: RenditionStatus;
  workerId?: string; // e.g. "worker-01", "worker-02"
  processingTime?: number;
  error?: string;
}

export interface Video {
  id: string;
  filename: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  status: VideoStatus;
  thumbnailUrl?: string;
  playbackUrl?: string;
  createdAt: string;
  updatedAt?: string;
  renditions: Rendition[];
  errorMessage?: string;
}

export interface UploadProgressInfo {
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  speed: string;
  timeRemaining?: string;
  stage: "requesting_url" | "uploading" | "registering" | "complete" | "error";
  error?: string;
}

export interface CreateVideoPayload {
  filename: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  mimeType?: string;
}
