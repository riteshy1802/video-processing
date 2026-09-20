export type VideoStatus =
  | "pending_upload"
  | "PENDING_UPLOAD"
  | "uploading"
  | "UPLOADING"
  | "uploaded"
  | "UPLOADED"
  | "queued"
  | "processing"
  | "PROCESSING"
  | "finalizing"
  | "FINALIZING"
  | "failing"
  | "FAILING"
  | "cancelling"
  | "CANCELLING"
  | "cancelled"
  | "CANCELLED"
  | "ready"
  | "done"
  | "DONE"
  | "completed"
  | "COMPLETED"
  | "failed"
  | "FAILED";

export type RenditionStatus =
  | "queued"
  | "processing"
  | "cancelling"
  | "cancelled"
  | "ready"
  | "failed";

export type ResolutionType = "360p" | "480p" | "720p" | "1080p" | "1440p" | "2160p" | string;

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
  thumbnailVersion?: number;
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

export interface ChunkProgressState {
  chunk_id: string;
  chunk_index: number;
  rendition_id: string;
  resolution: string;
  worker_id?: string;
  status: "PENDING" | "RETRYING" | "PROCESSING" | "DONE" | "FAILED" | "CANCELLED";
  progress: number;
  attempt?: number;
  start_seconds?: number;
  end_seconds?: number;
  error?: string;
  message?: string;
  updated_at?: string;
}

export interface RenditionProgressState {
  rendition_id: string;
  resolution: string;
  status: "PENDING" | "PROCESSING" | "CANCELLING" | "CANCELLED" | "READY" | "FAILED";
  progress: number;
  total_chunks: number;
  completed_chunks: number;
  chunks: ChunkProgressState[];
}

export interface ProcessingSnapshot {
  video_id: string;
  video_status: string;
  total_renditions: number;
  total_chunks: number;
  completed_chunks: number;
  overall_progress: number;
  error?: string;
  message?: string;
  thumbnail_url?: string;
  thumbnail_version?: number;
  renditions: RenditionProgressState[];
}

export interface SSEEventData {
  type: string;
  video_id: string;
  status?: string;
  rendition_id?: string;
  resolution?: string;
  chunk_id?: string;
  chunk_index?: number;
  worker_id?: string;
  progress?: number;
  error?: string;
  message?: string;
  thumbnail_url?: string;
  thumbnail_version?: number;
  attempt?: number;
}
