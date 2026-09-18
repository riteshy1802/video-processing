"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface HlsPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  className?: string;
  onMetadataLoaded?: (metadata: { duration: number; width: number; height: number }) => void;
}

export function HlsPlayer({
  src,
  poster,
  autoPlay = false,
  className,
  onMetadataLoaded,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Reset state on src change
    setIsLoading(true);
    setError(null);

    // Metadata & event listeners
    const handleLoadedMetadata = () => {
      setIsLoading(false);
      if (onMetadataLoaded && (video.duration > 0 || video.videoWidth > 0)) {
        onMetadataLoaded({
          duration: Math.round(video.duration || 0),
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };

    const handlePlaying = () => {
      setIsLoading(false);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleError = () => {
      setIsLoading(false);
      if (!error && video.error) {
        setError(`Native playback error: ${video.error.message || "Unable to play video."}`);
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("error", handleError);

    // 1. Check Native HLS support (e.g. Safari / iOS Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      if (autoPlay) {
        video.play().catch(() => {
          // Autoplay prevented by browser policy
        });
      }
    } 
    // 2. Check hls.js support (Chrome, Firefox, Edge, etc.)
    else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        if (autoPlay) {
          video.play().catch(() => {
            // Autoplay prevented by browser policy
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("HLS fatal network error encountered, attempting recovery...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("HLS fatal media error encountered, attempting recovery...");
              hls.recoverMediaError();
              break;
            default:
              console.error("HLS unrecoverable fatal error:", data);
              setError("Fatal stream playback error. Cannot load HLS master playlist.");
              setIsLoading(false);
              hls.destroy();
              break;
          }
        }
      });
    } else {
      setError("HLS playback is not supported in this browser.");
      setIsLoading(false);
    }

    // Cleanup hls.js instance on component unmount or src change
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("error", handleError);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay, onMetadataLoaded]);

  return (
    <div
      className={cn(
        "relative aspect-video w-full bg-slate-950 rounded-2xl border border-slate-300 dark:border-slate-800 overflow-hidden shadow-md flex items-center justify-center",
        className
      )}
    >
      {/* HTML5 Native Video Element */}
      <video
        ref={videoRef}
        poster={poster}
        controls
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Loading Overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20 pointer-events-none">
          <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
          <span className="text-xs font-mono font-medium text-slate-300">
            Loading HLS Stream...
          </span>
        </div>
      )}

      {/* Error State Overlay */}
      {error && (
        <div className="absolute inset-0 bg-slate-950/90 border border-rose-500/30 flex flex-col items-center justify-center p-6 text-center z-30 font-sans">
          <AlertCircle className="h-10 w-10 text-rose-400 mb-3" />
          <h4 className="text-slate-100 font-semibold mb-1">Playback Error</h4>
          <p className="text-xs font-mono text-slate-400 max-w-md">{error}</p>
        </div>
      )}
    </div>
  );
}
