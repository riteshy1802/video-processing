"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  Settings, 
  AlertCircle,
  Film,
  Check,
  Loader2
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

interface VideoPlayerProps {
  src?: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}

export function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hlsPreviewRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ id: number; height: number; bitrate: number }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Hover frame preview state & non-blocking seek queue
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);
  const [isPreviewSeeking, setIsPreviewSeeking] = useState<boolean>(false);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef<boolean>(false);
  const pendingSeekTimeRef = useRef<number | null>(null);

  const QUALITY_OPTIONS = [
    { label: "Auto Quality", value: "auto" },
    { label: "1440p (2K QHD)", value: "1440" },
    { label: "1080p (Full HD)", value: "1080" },
    { label: "720p (HD)", value: "720" },
    { label: "480p (SD)", value: "480" },
    { label: "360p (Low)", value: "360" },
  ];

  // Initialize HLS for main player
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);

    const updateTime = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration || 0);
    };

    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateTime);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      if (autoPlay) video.play().catch(() => setIsPlaying(false));
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        const parsedLevels = data.levels.map((lvl, idx) => ({
          id: idx,
          height: lvl.height,
          bitrate: lvl.bitrate,
        }));
        setLevels(parsedLevels);
        if (autoPlay) video.play().catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            setError("Stream playback error.");
            hls.destroy();
          }
        }
      });

      return () => {
        hls.destroy();
        video.removeEventListener("timeupdate", updateTime);
        video.removeEventListener("loadedmetadata", updateTime);
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }

    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateTime);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [src, autoPlay]);

  // Initialize HLS for preview frame player (locked to 144p level-0 for instant non-blocking seeks)
  useEffect(() => {
    const previewVideo = previewVideoRef.current;
    if (!previewVideo || !src) return;

    if (previewVideo.canPlayType("application/vnd.apple.mpegurl")) {
      previewVideo.src = src;
    } else if (Hls.isSupported()) {
      const previewHls = new Hls({
        enableWorker: true,
        autoStartLoad: true,
        capLevelToPlayerSize: true,
      });
      hlsPreviewRef.current = previewHls;
      previewHls.loadSource(src);
      previewHls.attachMedia(previewVideo);

      previewHls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Lock preview player to lowest resolution (144p) for ultra-fast frame extraction
        previewHls.currentLevel = 0;
      });

      return () => {
        previewHls.destroy();
      };
    }
  }, [src]);

  // Handle queued seeks when preview video finishes seeking
  useEffect(() => {
    const pVideo = previewVideoRef.current;
    if (!pVideo) return;

    const handleSeekComplete = () => {
      setIsPreviewSeeking(false);
      isSeekingRef.current = false;

      // Process pending seek if user moved mouse during active seek
      if (pendingSeekTimeRef.current !== null) {
        const nextTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
        if (Math.abs(pVideo.currentTime - nextTime) > 0.1) {
          isSeekingRef.current = true;
          setIsPreviewSeeking(true);
          pVideo.currentTime = nextTime;
        }
      }
    };

    pVideo.addEventListener("seeked", handleSeekComplete);
    pVideo.addEventListener("canplay", handleSeekComplete);

    return () => {
      pVideo.removeEventListener("seeked", handleSeekComplete);
      pVideo.removeEventListener("canplay", handleSeekComplete);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch((err) => {
        console.error("Fullscreen error:", err);
      });
    }
  };

  const handleQualitySelect = (val: string) => {
    setSelectedQuality(val);
    setShowQualityMenu(false);

    if (!hlsRef.current) return;

    if (val === "auto") {
      hlsRef.current.currentLevel = -1;
    } else {
      const targetHeight = parseInt(val, 10);
      const matchedIndex = levels.findIndex(
        (lvl) => Math.abs(lvl.height - targetHeight) < 50
      );
      if (matchedIndex !== -1) {
        hlsRef.current.currentLevel = matchedIndex;
      } else {
        hlsRef.current.currentLevel = -1;
      }
    }
  };

  // Scrubber Hover Handler with 60fps Timestamp updates & Non-blocking Video Seek Queue
  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const scrubber = scrubberRef.current;
    if (!scrubber || !duration) return;

    const rect = scrubber.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = offsetX / rect.width;
    const calcTime = percent * duration;

    setHoverPos(offsetX);
    setHoverTime(calcTime);

    const pVideo = previewVideoRef.current;
    if (!pVideo || !isFinite(calcTime)) return;

    if (!isSeekingRef.current) {
      if (Math.abs(pVideo.currentTime - calcTime) > 0.1) {
        isSeekingRef.current = true;
        setIsPreviewSeeking(true);
        pVideo.currentTime = calcTime;
      }
    } else {
      pendingSeekTimeRef.current = calcTime;
    }
  };

  const handleScrubberMouseLeave = () => {
    setHoverTime(null);
    setIsPreviewSeeking(false);
    isSeekingRef.current = false;
    pendingSeekTimeRef.current = null;
  };

  if (!src) {
    return (
      <div className={cn("aspect-video bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 p-6 font-mono text-xs gap-3 shadow-xs", className)}>
        <Film className="h-8 w-8 text-slate-400 dark:text-slate-600" />
        <span>No video stream URL provided</span>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative group aspect-video bg-slate-950 rounded-2xl border border-slate-300 dark:border-slate-800 overflow-hidden shadow-md flex items-center justify-center pointer-events-auto",
        isFullscreen && "w-screen h-screen rounded-none border-none fixed inset-0 z-50",
        className
      )}
    >
      <video
        ref={videoRef}
        poster={poster}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
      />

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-slate-950/90 border border-rose-500/30 flex flex-col items-center justify-center p-6 text-center z-30">
          <AlertCircle className="h-10 w-10 text-rose-400 mb-3" />
          <h4 className="text-slate-100 font-semibold mb-1">Playback Error</h4>
          <p className="text-xs font-mono text-slate-400 max-w-md">{error}</p>
        </div>
      )}

      {/* Controls Bar Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/95 via-slate-950/75 to-transparent p-4 md:p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-3 z-30 pointer-events-auto">
        
        {/* Scrubber Container with Permanently Mounted Frame Preview Tooltip */}
        <div
          ref={scrubberRef}
          onMouseMove={handleScrubberMouseMove}
          onMouseLeave={handleScrubberMouseLeave}
          className="relative w-full flex items-center group/scrubber cursor-pointer py-2"
        >
          {/* Frame Hover Tooltip Preview Box - Always Mounted for Instant HLS Seeking */}
          <div
            className={cn(
              "absolute bottom-full mb-3 -translate-x-1/2 rounded-xl border border-slate-700/90 bg-slate-900/95 p-1.5 shadow-2xl z-50 flex flex-col items-center gap-1 font-mono text-[11px] text-slate-100 pointer-events-none transition-all duration-150 origin-bottom",
              hoverTime !== null ? "opacity-100 scale-100" : "opacity-0 scale-95"
            )}
            style={{ left: `${hoverPos}px` }}
          >
            {/* Video Frame Preview Container */}
            <div className="w-44 md:w-56 aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center relative shadow-inner">
              <video
                ref={previewVideoRef}
                muted
                playsInline
                onSeeking={() => setIsPreviewSeeking(true)}
                onSeeked={() => setIsPreviewSeeking(false)}
                onCanPlay={() => setIsPreviewSeeking(false)}
                onLoadedData={() => setIsPreviewSeeking(false)}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-150",
                  isPreviewSeeking ? "opacity-40" : "opacity-100"
                )}
              />

              {/* Subtle loading spinner when seeking frames */}
              {isPreviewSeeking && (
                <div className="absolute inset-0 bg-slate-950/50 flex items-center justify-center text-sky-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
            </div>

            {/* Timestamp */}
            <span className="font-bold text-sky-400 text-[11px]">
              {formatDuration(hoverTime || 0)}
            </span>
          </div>

          {/* Sleek Constant Height Progress Bar with Seamless Centered Thumb */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            style={{
              background: `linear-gradient(to right, #0284c7 0%, #38bdf8 ${progressPercent}%, rgba(255, 255, 255, 0.2) ${progressPercent}%, rgba(255, 255, 255, 0.2) 100%)`,
            }}
            className={cn(
              "w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none transition-all shadow-xs",
              "[&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5",
              "[&::-webkit-slider-thumb]:rounded-full",
              "[&::-webkit-slider-thumb]:bg-sky-400",
              "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white",
              "[&::-webkit-slider-thumb]:shadow-md",
              "[&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150",
              "[&::-webkit-slider-thumb]:hover:scale-125",
              "[&::-moz-range-thumb]:appearance-none",
              "[&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5",
              "[&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:bg-sky-400",
              "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white",
              "[&::-moz-range-thumb]:shadow-md"
            )}
          />
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>

            <button
              onClick={toggleMute}
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {/* Time Display */}
            <span className="text-xs font-mono text-slate-200 font-medium">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* Quality Menu Popover */}
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 font-mono text-xs transition-colors cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5 text-sky-400" />
                <span className="capitalize">{selectedQuality === "auto" ? "Auto Quality" : `${selectedQuality}p`}</span>
              </button>

              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-44 rounded-xl bg-slate-900 border border-slate-700 p-1.5 shadow-xl font-mono text-xs text-slate-200 z-50">
                  <div className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1 font-semibold">
                    Streaming Quality
                  </div>
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleQualitySelect(opt.value)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-slate-800 transition-colors cursor-pointer",
                        selectedQuality === opt.value && "text-sky-400 bg-sky-500/10 font-semibold"
                      )}
                    >
                      <span>{opt.label}</span>
                      {selectedQuality === opt.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/60 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
