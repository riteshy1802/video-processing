import { Video, CreateVideoPayload, Rendition } from "@/types/video";
import { getExpectedRenditions } from "@/lib/utils";

const STORAGE_KEY = "video_processing_platform_videos";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;

// Mock dataset displaying parallel Kafka worker consumers based on source resolution mapping
const MOCK_VIDEOS: Video[] = [
  {
    id: "vid_demo_01",
    filename: "infrastructure_overview_1080p.mp4",
    size: 245100000,
    duration: 342,
    width: 1920,
    height: 1080,
    mimeType: "video/mp4",
    status: "ready",
    thumbnailUrl: "",
    playbackUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    renditions: [
      { resolution: "360p", status: "ready", workerId: "worker-01", processingTime: 5 },
      { resolution: "480p", status: "ready", workerId: "worker-02", processingTime: 12 },
      { resolution: "720p", status: "ready", workerId: "worker-03", processingTime: 24 },
      { resolution: "1080p", status: "ready", workerId: "worker-04", processingTime: 45 },
    ],
  },
  {
    id: "vid_demo_02",
    filename: "distributed_transcoding_pipeline.mov",
    size: 512000000,
    duration: 615,
    width: 3840,
    height: 2160,
    mimeType: "video/quicktime",
    status: "processing",
    thumbnailUrl: "",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    renditions: [
      { resolution: "360p", status: "ready", workerId: "worker-01", processingTime: 6 },
      { resolution: "480p", status: "ready", workerId: "worker-02", processingTime: 18 },
      { resolution: "720p", status: "ready", workerId: "worker-03", processingTime: 28 },
      { resolution: "1080p", status: "processing", workerId: "worker-04" },
      { resolution: "1440p", status: "processing", workerId: "worker-05" },
    ],
  },
  {
    id: "vid_demo_03",
    filename: "benchmark_stress_test_4k.mkv",
    size: 1024000000,
    duration: 1240,
    width: 3840,
    height: 2160,
    mimeType: "video/x-matroska",
    status: "queued",
    thumbnailUrl: "",
    createdAt: new Date(Date.now() - 600000).toISOString(),
    renditions: [
      { resolution: "360p", status: "queued" },
      { resolution: "480p", status: "queued" },
      { resolution: "720p", status: "queued" },
      { resolution: "1080p", status: "queued" },
      { resolution: "1440p", status: "queued" },
    ],
  },
];

function getStoredVideos(): Video[] {
  if (typeof window === "undefined") return MOCK_VIDEOS;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_VIDEOS));
      return MOCK_VIDEOS;
    }
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to read from localStorage:", e);
    return MOCK_VIDEOS;
  }
}

function saveStoredVideos(videos: Video[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}

/**
 * Direct browser S3 upload via presigned PUT URL using XMLHttpRequest for real-time progress.
 */
export function uploadFileToS3WithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number, loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 direct upload failed with HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error occurred during S3 direct upload"));
    };

    xhr.send(file);
  });
}

export const VideoAPI = {
  async getVideos(): Promise<Video[]> {
    if (API_BASE_URL) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/videos`);
        if (res.ok) {
          const data = await res.json();
          return data.map((v: any) => ({
            id: v.id,
            filename: v.original_filename,
            size: v.file_size_bytes,
            mimeType: v.content_type,
            status: v.status.toLowerCase() as any,
            createdAt: v.created_at,
            renditions: [],
          }));
        }
      } catch (e) {
        console.warn("FastAPI backend not reachable, using local storage demo dataset", e);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    return getStoredVideos();
  },

  async getVideo(id: string): Promise<Video | null> {
    if (API_BASE_URL) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/videos/${id}`);
        if (res.ok) {
          const v = await res.json();
          return {
            id: v.id,
            filename: v.original_filename,
            size: v.file_size_bytes,
            mimeType: v.content_type,
            status: v.status.toLowerCase() as any,
            createdAt: v.created_at,
            playbackUrl: v.original_url,
            renditions: [],
          };
        }
      } catch (e) {
        console.warn("FastAPI backend not reachable, using local storage demo dataset", e);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const videos = getStoredVideos();
    return videos.find((v) => v.id === id) || null;
  },

  async createVideo(payload: CreateVideoPayload): Promise<{ video_id: string; upload_url: string; s3_key: string; expires_in: number; id?: string }> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/api/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: payload.filename,
          content_type: payload.mimeType || "video/mp4",
          file_size_bytes: payload.size,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to initiate video upload" }));
        throw new Error(err.detail || "Failed to initiate upload");
      }
      const data = await res.json();
      return { ...data, id: data.video_id };
    }

    // Demo fallback
    await new Promise((resolve) => setTimeout(resolve, 200));
    const newId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expectedResList = getExpectedRenditions(payload.height);
    const renditions: Rendition[] = expectedResList.map((res) => ({
      resolution: res,
      status: "queued",
    }));

    const newVideo: Video = {
      id: newId,
      filename: payload.filename,
      size: payload.size,
      duration: payload.duration,
      width: payload.width,
      height: payload.height,
      mimeType: payload.mimeType,
      status: "uploading",
      createdAt: new Date().toISOString(),
      renditions,
    };

    const videos = getStoredVideos();
    videos.unshift(newVideo);
    saveStoredVideos(videos);
    return {
      video_id: newId,
      id: newId,
      upload_url: "",
      s3_key: `videos/${newId}/original/${payload.filename}`,
      expires_in: 900,
    };
  },

  async requestUploadUrl(videoId: string, filename: string): Promise<{ uploadUrl: string; key: string }> {
    return {
      uploadUrl: "",
      key: `videos/${videoId}/original/${filename}`,
    };
  },

  async completeUpload(videoId: string): Promise<any> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/api/videos/${videoId}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to verify S3 upload" }));
        throw new Error(err.detail || "Upload verification failed");
      }
      return await res.json();
    }

    // Demo fallback
    await new Promise((resolve) => setTimeout(resolve, 200));
    const videos = getStoredVideos();
    const videoIndex = videos.findIndex((v) => v.id === videoId);
    if (videoIndex !== -1) {
      videos[videoIndex].status = "uploaded";
      saveStoredVideos(videos);
    }
    return { video_id: videoId, status: "UPLOADED" };
  },

  async deleteVideo(videoId: string): Promise<void> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/api/videos/${videoId}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) {
        const err = await res.json().catch(() => ({ detail: "Failed to delete video asset" }));
        throw new Error(err.detail || "Delete failed");
      }
      return;
    }

    // Demo fallback
    await new Promise((resolve) => setTimeout(resolve, 150));
    const videos = getStoredVideos().filter((v) => v.id !== videoId);
    saveStoredVideos(videos);
  },

  async resetMockData(): Promise<Video[]> {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_VIDEOS));
    }
    return MOCK_VIDEOS;
  },
};
