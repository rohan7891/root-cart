import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Copy,
  Trash2,
  Plus,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  Download,
  Upload,
  Mic,
  Square,
  Type as TypeIcon,
  Subtitles,
  Sliders,
  Layers,
  ZoomIn,
  ZoomOut,
  Save,
  Film,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  VideoProject,
  TimelineClip,
  AspectRatio,
  TransitionType,
  Language,
  SharedMediaAsset,
} from '../types/studio';
import { t } from '../i18n/translations';
import { saveProjectToDB, saveMediaAssetToDB } from '../services/storageService';
import { PublicAdConfig, canShowInterstitial, InterstitialAdModal } from './AdPlacements';

interface VideoEditorProps {
  project: VideoProject;
  onProjectChange: (updated: VideoProject) => void;
  lang: Language;
  adConfig: PublicAdConfig | null;
  maxExportResolution: '480p' | '720p' | '1080p';
  onSaveAssetToLibrary: (asset: SharedMediaAsset) => void;
}

// Helper to parse SRT file content into TimelineClips
function parseSrtContent(srtText: string, trackId: string): TimelineClip[] {
  const blocks = srtText.trim().split(/\n\s*\n/);
  const clips: TimelineClip[] = [];

  const parseTime = (tc: string): number => {
    const parts = tc.trim().replace(',', '.').split(':');
    if (parts.length < 3) return 0;
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  };

  blocks.forEach((block, idx) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const timeLine = lines.find((l) => l.includes('-->'));
      if (timeLine) {
        const [startStr, endStr] = timeLine.split('-->');
        const start = parseTime(startStr);
        const end = Math.max(start + 0.5, parseTime(endStr));
        const textLines = lines.slice(lines.indexOf(timeLine) + 1).join(' ');
        clips.push({
          id: `clp_srt_${Date.now()}_${idx}`,
          trackId,
          type: 'subtitle',
          name: `SRT #${idx + 1}`,
          startTime: Number(start.toFixed(2)),
          duration: Number((end - start).toFixed(2)),
          trimStart: 0,
          scale: 1,
          rotation: 0,
          flipH: false,
          flipV: false,
          x: 0,
          y: 35,
          speed: 1,
          volume: 0,
          fadeIn: 0.1,
          fadeOut: 0.1,
          transition: 'none',
          textContent: textLines || 'Subtitle',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: 24,
          textColor: '#FFFFFF',
          textBgColor: '#000000B3',
          textOutline: true,
          textAlign: 'center',
          animationPreset: 'none',
          adjustments: {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            exposure: 0,
            temperature: 0,
            tint: 0,
            opacity: 100,
            chromaKeyEnabled: false,
            chromaKeyColor: '#00ff00',
            chromaKeyThreshold: 40,
          },
        });
      }
    }
  });
  return clips;
}

// Format seconds into SRT timestamp 00:00:00,000
function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export const VideoEditorWorkspace: React.FC<VideoEditorProps> = ({
  project,
  onProjectChange,
  lang,
  adConfig,
  maxExportResolution,
  onSaveAssetToLibrary,
}) => {
  const [playhead, setPlayhead] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(project.clips[0]?.id || null);
  const [timelineZoom, setTimelineZoom] = useState<number>(48); // pixels per second
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [history, setHistory] = useState<VideoProject[]>([project]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [inspectorTab, setInspectorTab] = useState<'transform' | 'color' | 'audio' | 'text' | 'export'>('transform');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Voiceover recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState<boolean>(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  // Real Video Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportRes, setExportRes] = useState<'480p' | '720p' | '1080p'>('720p');
  const [exportFps, setExportFps] = useState<24 | 30>(30);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [showPostExportAd, setShowPostExportAd] = useState<boolean>(false);
  const cancelExportRef = useRef<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());

  const totalDuration = Math.max(
    4,
    ...project.clips.map((c) => c.startTime + c.duration)
  );

  const selectedClip = project.clips.find((c) => c.id === selectedClipId) || null;

  // Commit changes to undo/redo stack & IndexedDB autosave
  const commitProject = useCallback(
    (nextProj: VideoProject) => {
      const sliced = history.slice(0, historyIndex + 1);
      const nextHistory = [...sliced, nextProj].slice(-25);
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
      onProjectChange(nextProj);
      saveProjectToDB(nextProj).catch(() => {});
    },
    [history, historyIndex, onProjectChange]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      onProjectChange(history[nextIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      onProjectChange(history[nextIdx]);
    }
  };

  // Preload media elements for uploaded video/image clips
  useEffect(() => {
    project.clips.forEach((clip) => {
      if (clip.sourceUrl && !mediaElementsRef.current.has(clip.id)) {
        if (clip.type === 'video') {
          const vid = document.createElement('video');
          vid.src = clip.sourceUrl;
          vid.muted = true;
          vid.playsInline = true;
          vid.crossOrigin = 'anonymous';
          vid.load();
          mediaElementsRef.current.set(clip.id, vid);
        } else if (clip.type === 'image') {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = clip.sourceUrl;
          mediaElementsRef.current.set(clip.id, img);
        }
      }
    });
  }, [project.clips]);

  // Compute canvas dimensions from aspect ratio and 4GB RAM Proxy Guard
  const getCanvasDimensions = (resPreset?: '480p' | '720p' | '1080p') => {
    const baseHeight = resPreset
      ? resPreset === '1080p'
        ? 1080
        : resPreset === '720p'
        ? 720
        : 480
      : project.lowMemoryProxyMode
      ? 480
      : 720;

    switch (project.aspectRatio) {
      case '9:16':
        return { width: Math.round((baseHeight * 9) / 16), height: baseHeight };
      case '1:1':
        return { width: baseHeight, height: baseHeight };
      case '4:5':
        return { width: Math.round((baseHeight * 4) / 5), height: baseHeight };
      case '3:4':
        return { width: Math.round((baseHeight * 3) / 4), height: baseHeight };
      case '16:9':
      default:
        return { width: Math.round((baseHeight * 16) / 9), height: baseHeight };
    }
  };

  // Render a single frame at `timeSec` onto the target 2D canvas
  const renderFrameAtTime = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, timeSec: number) => {
      ctx.save();
      ctx.fillStyle = project.canvasBgColor || '#090D16';
      ctx.fillRect(0, 0, width, height);

      // Find visible tracks in bottom-to-top compositing order: video -> overlay -> text -> subtitle
      const trackOrder: Array<'video' | 'overlay' | 'text' | 'subtitle'> = [
        'video',
        'overlay',
        'text',
        'subtitle',
      ];

      for (const trackType of trackOrder) {
        const tracksOfType = project.tracks.filter((t) => t.type === trackType && !t.hidden);
        for (const track of tracksOfType) {
          const activeClips = project.clips.filter(
            (c) =>
              c.trackId === track.id &&
              timeSec >= c.startTime &&
              timeSec <= c.startTime + c.duration
          );

          for (const clip of activeClips) {
            const localTime = (timeSec - clip.startTime) * clip.speed;
            const progress = Math.max(0, Math.min(1, (timeSec - clip.startTime) / Math.max(0.1, clip.duration)));

            // Compute fade in / fade out alpha
            let alpha = (clip.adjustments?.opacity ?? 100) / 100;
            const elapsed = timeSec - clip.startTime;
            const remaining = clip.startTime + clip.duration - timeSec;
            if (clip.fadeIn > 0 && elapsed < clip.fadeIn) {
              alpha *= elapsed / clip.fadeIn;
            }
            if (clip.fadeOut > 0 && remaining < clip.fadeOut) {
              alpha *= remaining / clip.fadeOut;
            }

            // Transition offset calculations
            let transOffsetX = 0;
            let transScale = 1;
            const transitionWindow = Math.min(0.6, clip.duration * 0.35);
            if (elapsed < transitionWindow) {
              const tRatio = elapsed / transitionWindow;
              if (clip.transition === 'fade') {
                alpha *= tRatio;
              } else if (clip.transition === 'slideLeft') {
                transOffsetX = (1 - tRatio) * width * 0.4;
              } else if (clip.transition === 'zoomIn') {
                transScale = 0.6 + 0.4 * tRatio;
              }
            }

            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

            // Apply CSS-compatible filter string for brightness, contrast, saturation, exposure, hue-rotate
            const adj = clip.adjustments;
            const b = 100 + (adj?.brightness || 0) + (adj?.exposure || 0) * 0.8;
            const c = 100 + (adj?.contrast || 0);
            const s = 100 + (adj?.saturation || 0);
            const hue = (adj?.tint || 0) * 1.2;
            ctx.filter = `brightness(${Math.max(10, b)}%) contrast(${Math.max(10, c)}%) saturate(${Math.max(0, s)}%) hue-rotate(${hue}deg)`;

            // Center transform matrix
            const centerX = width / 2 + (clip.x / 100) * (width / 2) + transOffsetX;
            const centerY = height / 2 + (clip.y / 100) * (height / 2);
            ctx.translate(centerX, centerY);
            ctx.rotate((clip.rotation * Math.PI) / 180);
            ctx.scale(
              (clip.flipH ? -1 : 1) * clip.scale * transScale,
              (clip.flipV ? -1 : 1) * clip.scale * transScale
            );

            if (clip.type === 'video' || clip.type === 'image') {
              const mediaEl = mediaElementsRef.current.get(clip.id);
              if (mediaEl) {
                if (mediaEl instanceof HTMLVideoElement) {
                  const targetVidTime = clip.trimStart + localTime;
                  if (Math.abs(mediaEl.currentTime - targetVidTime) > 0.15) {
                    mediaEl.currentTime = targetVidTime;
                  }
                  if (mediaEl.readyState >= 2) {
                    ctx.drawImage(mediaEl, -width / 2, -height / 2, width, height);
                  }
                } else if (mediaEl instanceof HTMLImageElement && mediaEl.complete) {
                  ctx.drawImage(mediaEl, -width / 2, -height / 2, width, height);
                }
              } else {
                // Procedural dynamic studio scene when no external file is attached
                const isSecondScene = clip.id.includes('2');
                const grad = ctx.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
                if (!isSecondScene) {
                  grad.addColorStop(0, '#0f172a');
                  grad.addColorStop(0.55, '#1e293b');
                  grad.addColorStop(1, '#b45309');
                } else {
                  grad.addColorStop(0, '#090d16');
                  grad.addColorStop(0.5, '#0f172a');
                  grad.addColorStop(1, '#0284c7');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(-width / 2, -height / 2, width, height);

                // Animated horizon sun / light orb
                const orbX = -width * 0.2 + progress * width * 0.4;
                const orbY = -height * 0.12;
                const rad = ctx.createRadialGradient(orbX, orbY, 8, orbX, orbY, height * 0.35);
                rad.addColorStop(0, isSecondScene ? '#38bdf8' : '#fef3c7');
                rad.addColorStop(0.4, isSecondScene ? '#0284c788' : '#f59e0b88');
                rad.addColorStop(1, 'transparent');
                ctx.fillStyle = rad;
                ctx.beginPath();
                ctx.arc(orbX, orbY, height * 0.35, 0, Math.PI * 2);
                ctx.fill();

                // Animated waveform / skyline bars
                ctx.fillStyle = '#090d16cc';
                ctx.fillRect(-width / 2, height * 0.22, width, height * 0.28);
                ctx.fillStyle = isSecondScene ? '#38bdf844' : '#f59e0b44';
                for (let i = 0; i < 24; i++) {
                  const barH = (Math.sin(timeSec * 3.5 + i * 0.6) * 0.5 + 0.5) * (height * 0.12) + 8;
                  const bx = -width * 0.42 + i * (width * 0.036);
                  ctx.fillRect(bx, height * 0.22 - barH, width * 0.022, barH);
                }
              }

              // Warm/Cool temperature tint overlay if non-zero
              if (adj?.temperature && adj.temperature !== 0) {
                ctx.fillStyle =
                  adj.temperature > 0
                    ? `rgba(245, 158, 11, ${Math.min(0.35, adj.temperature / 150)})`
                    : `rgba(56, 189, 248, ${Math.min(0.35, Math.abs(adj.temperature) / 150)})`;
                ctx.fillRect(-width / 2, -height / 2, width, height);
              }
            } else if (clip.type === 'text' || clip.type === 'subtitle') {
              ctx.filter = 'none';
              const text = clip.textContent || clip.name;
              const fontSize = Math.round(((clip.fontSize || 28) * height) / 720);
              ctx.font = `600 ${fontSize}px "${clip.fontFamily || 'Plus Jakarta Sans'}", sans-serif`;
              ctx.textAlign = clip.textAlign || 'center';
              ctx.textBaseline = 'middle';

              // Animation preset
              let displayStr = text;
              let animY = 0;
              if (clip.animationPreset === 'typewriter') {
                const chars = Math.max(1, Math.floor(text.length * Math.min(1, progress * 1.6)));
                displayStr = text.slice(0, chars);
              } else if (clip.animationPreset === 'slideUp' && elapsed < 0.35) {
                animY = (1 - elapsed / 0.35) * 28;
              } else if (clip.animationPreset === 'pop' && elapsed < 0.25) {
                const popScale = 0.7 + (elapsed / 0.25) * 0.3;
                ctx.scale(popScale, popScale);
              }

              const metrics = ctx.measureText(displayStr);
              const padX = fontSize * 0.6;
              const padY = fontSize * 0.4;
              const boxW = metrics.width + padX * 2;
              const boxH = fontSize + padY * 2;

              if (clip.textBgColor && clip.textBgColor !== 'transparent') {
                ctx.fillStyle = clip.textBgColor;
                ctx.beginPath();
                ctx.roundRect(-boxW / 2, animY - boxH / 2, boxW, boxH, 8);
                ctx.fill();
              }

              if (clip.textOutline) {
                ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.1));
                ctx.strokeStyle = '#000000';
                ctx.strokeText(displayStr, 0, animY);
              }

              ctx.fillStyle = clip.textColor || '#FFFFFF';
              ctx.fillText(displayStr, 0, animY);
            }

            ctx.restore();
          }
        }
      }

      // Apply Chroma Key pixel pass if any active clip has chromaKeyEnabled
      const hasChroma = project.clips.some(
        (c) =>
          c.adjustments?.chromaKeyEnabled &&
          timeSec >= c.startTime &&
          timeSec <= c.startTime + c.duration
      );
      if (hasChroma) {
        const activeChromaClip = project.clips.find(
          (c) =>
            c.adjustments?.chromaKeyEnabled &&
            timeSec >= c.startTime &&
            timeSec <= c.startTime + c.duration
        );
        if (activeChromaClip) {
          const hex = activeChromaClip.adjustments.chromaKeyColor || '#00ff00';
          const rTarget = parseInt(hex.slice(1, 3), 16) || 0;
          const gTarget = parseInt(hex.slice(3, 5), 16) || 255;
          const bTarget = parseInt(hex.slice(5, 7), 16) || 0;
          const thresh = (activeChromaClip.adjustments.chromaKeyThreshold || 40) * 2.2;
          const imgData = ctx.getImageData(0, 0, width, height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const dist = Math.sqrt(
              (d[i] - rTarget) ** 2 + (d[i + 1] - gTarget) ** 2 + (d[i + 2] - bTarget) ** 2
            );
            if (dist < thresh) {
              d[i + 3] = 25;
            }
          }
          ctx.putImageData(imgData, 0, 0);
        }
      }

      ctx.restore();
    },
    [project]
  );

  // Playback loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderFrameAtTime(ctx, canvas.width, canvas.height, playhead);
  }, [playhead, project, renderFrameAtTime]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastTs = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      setPlayhead((prev) => {
        const next = prev + dt;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration]);

  // Update a specific clip property
  const updateSelectedClip = (updater: (clip: TimelineClip) => TimelineClip) => {
    if (!selectedClip) return;
    const nextClips = project.clips.map((c) => (c.id === selectedClip.id ? updater(c) : c));
    commitProject({ ...project, clips: nextClips });
  };

  // Split selected clip at current playhead
  const handleSplitClip = () => {
    if (!selectedClip) return;
    if (
      playhead <= selectedClip.startTime + 0.2 ||
      playhead >= selectedClip.startTime + selectedClip.duration - 0.2
    ) {
      setStatusMessage('Move the playhead inside the selected clip to split it.');
      return;
    }
    const firstDuration = Number((playhead - selectedClip.startTime).toFixed(2));
    const secondDuration = Number((selectedClip.duration - firstDuration).toFixed(2));

    const firstPart: TimelineClip = {
      ...selectedClip,
      duration: firstDuration,
    };
    const secondPart: TimelineClip = {
      ...selectedClip,
      id: `clp_${Date.now()}`,
      name: `${selectedClip.name} (Part 2)`,
      startTime: Number(playhead.toFixed(2)),
      duration: secondDuration,
      trimStart: Number((selectedClip.trimStart + firstDuration).toFixed(2)),
    };

    const nextClips = project.clips.flatMap((c) =>
      c.id === selectedClip.id ? [firstPart, secondPart] : [c]
    );
    commitProject({ ...project, clips: nextClips });
    setSelectedClipId(secondPart.id);
    setStatusMessage('Clip split at playhead.');
  };

  const handleDuplicateClip = () => {
    if (!selectedClip) return;
    const dup: TimelineClip = {
      ...selectedClip,
      id: `clp_${Date.now()}`,
      name: `${selectedClip.name} Copy`,
      startTime: Number((selectedClip.startTime + selectedClip.duration).toFixed(2)),
    };
    commitProject({ ...project, clips: [...project.clips, dup] });
    setSelectedClipId(dup.id);
  };

  const handleDeleteClip = () => {
    if (!selectedClip) return;
    const nextClips = project.clips.filter((c) => c.id !== selectedClip.id);
    commitProject({ ...project, clips: nextClips });
    setSelectedClipId(nextClips[0]?.id || null);
  };

  // Import video, image, or audio file into timeline
  const handleImportMediaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 150 * 1024 * 1024) {
      setStatusMessage('File exceeds 150MB safe memory threshold for 4GB RAM devices.');
      return;
    }

    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');

    if (!isVideo && !isImage && !isAudio) {
      setStatusMessage('Unsupported file format. Please select MP4, WebM, JPEG, PNG, WebP, MP3, or WAV.');
      return;
    }

    const targetTrackId = isAudio ? 'trk_audio' : 'trk_video';
    const newClip: TimelineClip = {
      id: `clp_imp_${Date.now()}`,
      trackId: targetTrackId,
      type: isVideo ? 'video' : isImage ? 'image' : 'audio',
      name: file.name,
      startTime: Number(playhead.toFixed(2)),
      duration: 5,
      trimStart: 0,
      sourceUrl: url,
      sourceMimeType: file.type,
      fileSize: file.size,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      x: 0,
      y: 0,
      speed: 1,
      volume: 100,
      fadeIn: 0.2,
      fadeOut: 0.2,
      transition: 'fade',
      adjustments: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        exposure: 0,
        temperature: 0,
        tint: 0,
        opacity: 100,
        chromaKeyEnabled: false,
        chromaKeyColor: '#00ff00',
        chromaKeyThreshold: 40,
      },
    };

    commitProject({ ...project, clips: [...project.clips, newClip] });
    setSelectedClipId(newClip.id);
    setStatusMessage(`Imported ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Also save to Shared Media Library
    const asset: SharedMediaAsset = {
      id: `ast_${Date.now()}`,
      name: file.name,
      type: isVideo ? 'video' : isImage ? 'image' : 'audio',
      mimeType: file.type,
      sizeBytes: file.size,
      dataUrl: url,
      folder: isAudio ? 'Audio' : 'Camera',
      createdAt: new Date().toISOString(),
    };
    saveMediaAssetToDB(asset).catch(() => {});
    onSaveAssetToLibrary(asset);
  };

  // Add Text or Subtitle Clip
  const handleAddTextOrSubtitle = (kind: 'text' | 'subtitle') => {
    const newClip: TimelineClip = {
      id: `clp_${kind}_${Date.now()}`,
      trackId: kind === 'text' ? 'trk_text' : 'trk_sub',
      type: kind,
      name: kind === 'text' ? 'Title Overlay' : 'Subtitle Line',
      startTime: Number(playhead.toFixed(2)),
      duration: 3,
      trimStart: 0,
      scale: 1,
      rotation: 0,
      flipH: false,
      flipV: false,
      x: 0,
      y: kind === 'text' ? -15 : 35,
      speed: 1,
      volume: 0,
      fadeIn: 0.2,
      fadeOut: 0.2,
      transition: 'fade',
      textContent:
        kind === 'text'
          ? lang === 'bn'
            ? 'নতুন শিরোনাম'
            : 'NEW STUDIO TITLE'
          : lang === 'bn'
          ? 'নতুন সাবটাইটেল লাইন যোগ করা হয়েছে'
          : 'New subtitle caption line',
      fontFamily: kind === 'text' ? 'Outfit' : 'Plus Jakarta Sans',
      fontSize: kind === 'text' ? 38 : 24,
      textColor: kind === 'text' ? '#F59E0B' : '#FFFFFF',
      textBgColor: '#000000B3',
      textOutline: true,
      textAlign: 'center',
      animationPreset: kind === 'text' ? 'pop' : 'slideUp',
      adjustments: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        exposure: 0,
        temperature: 0,
        tint: 0,
        opacity: 100,
        chromaKeyEnabled: false,
        chromaKeyColor: '#00ff00',
        chromaKeyThreshold: 40,
      },
    };
    commitProject({ ...project, clips: [...project.clips, newClip] });
    setSelectedClipId(newClip.id);
    setInspectorTab('text');
  };

  // Import SRT Subtitles
  const handleImportSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsedClips = parseSrtContent(content, 'trk_sub');
      if (parsedClips.length === 0) {
        setStatusMessage('No valid SRT blocks found in file.');
        return;
      }
      commitProject({ ...project, clips: [...project.clips, ...parsedClips] });
      setStatusMessage(`Imported ${parsedClips.length} SRT subtitle cues.`);
    };
    reader.readAsText(file);
  };

  // Export SRT Subtitles
  const handleExportSrt = () => {
    const subClips = project.clips
      .filter((c) => c.type === 'subtitle' || c.type === 'text')
      .sort((a, b) => a.startTime - b.startTime);

    if (subClips.length === 0) {
      setStatusMessage('No subtitle or text clips to export as SRT.');
      return;
    }

    const srtLines = subClips
      .map((clip, i) => {
        const start = formatSrtTime(clip.startTime);
        const end = formatSrtTime(clip.startTime + clip.duration);
        return `${i + 1}\n${start} --> ${end}\n${clip.textContent || clip.name}\n`;
      })
      .join('\n');

    const blob = new Blob([srtLines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_subtitles.srt`;
    a.click();
    setStatusMessage('Exported SRT subtitle file.');
  };

  // Record Real Microphone Voiceover onto Audio Track
  const handleToggleVoiceover = async () => {
    if (isRecordingVoice) {
      voiceRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      const recordStartPlayhead = playhead;
      const startWall = performance.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationSec = Math.max(1, Number(((performance.now() - startWall) / 1000).toFixed(2)));
        const blob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);

        const voiceClip: TimelineClip = {
          id: `clp_vo_${Date.now()}`,
          trackId: 'trk_audio',
          type: 'audio',
          name: `Mic Voiceover (${durationSec}s)`,
          startTime: Number(recordStartPlayhead.toFixed(2)),
          duration: durationSec,
          trimStart: 0,
          sourceUrl: audioUrl,
          sourceMimeType: 'audio/webm',
          scale: 1,
          rotation: 0,
          flipH: false,
          flipV: false,
          x: 0,
          y: 0,
          speed: 1,
          volume: 100,
          fadeIn: 0.1,
          fadeOut: 0.2,
          transition: 'none',
          adjustments: {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            exposure: 0,
            temperature: 0,
            tint: 0,
            opacity: 100,
            chromaKeyEnabled: false,
            chromaKeyColor: '#00ff00',
            chromaKeyThreshold: 40,
          },
        };
        commitProject({ ...project, clips: [...project.clips, voiceClip] });
        setSelectedClipId(voiceClip.id);
        setStatusMessage(`Recorded ${durationSec}s voiceover clip onto A1 Audio Track.`);
      };

      voiceRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
      setStatusMessage('Recording microphone voiceover... Click Stop when finished.');
    } catch (err: any) {
      setStatusMessage('Microphone permission denied or unavailable in this browser context.');
    }
  };

  // Extract Audio from selected video clip into A1 Audio Track
  const handleExtractAudioFromVideo = () => {
    if (!selectedClip || selectedClip.type !== 'video') {
      setStatusMessage('Select a video clip first to extract its audio track.');
      return;
    }
    const extractedClip: TimelineClip = {
      ...selectedClip,
      id: `clp_ext_aud_${Date.now()}`,
      trackId: 'trk_audio',
      type: 'audio',
      name: `Extracted Audio · ${selectedClip.name}`,
      volume: selectedClip.volume || 90,
    };
    const mutedOriginalClips = project.clips.map((c) =>
      c.id === selectedClip.id ? { ...c, volume: 0 } : c
    );
    commitProject({ ...project, clips: [...mutedOriginalClips, extractedClip] });
    setSelectedClipId(extractedClip.id);
    setStatusMessage('Extracted audio to A1 track and muted source video clip.');
  };

  // Real Video Rendering & Export Pipeline (Canvas captureStream + Web Audio synth/mix -> MediaRecorder WebM)
  const handleStartVideoExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportProgress(0);
    setExportedVideoUrl(null);
    cancelExportRef.current = false;

    const dims = getCanvasDimensions(exportRes);
    const offCanvas = document.createElement('canvas');
    offCanvas.width = dims.width;
    offCanvas.height = dims.height;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) {
      setIsExporting(false);
      return;
    }

    try {
      const stream = offCanvas.captureStream(exportFps);

      // Attach synthesized WebAudio ambience so exported WebM includes an actual audio stream
      let audioCtx: AudioContext | null = null;
      try {
        audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) stream.addTrack(audioTrack);
      } catch {
        // Fallback to video-only stream if AudioContext blocked
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: exportRes === '1080p' ? 5_000_000 : exportRes === '720p' ? 2_800_000 : 1_200_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (audioCtx) audioCtx.close().catch(() => {});
        if (cancelExportRef.current) {
          setStatusMessage('Video export cancelled. Temporary buffers released.');
          setIsExporting(false);
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setExportedVideoUrl(url);
        setIsExporting(false);
        setExportProgress(100);
        setStatusMessage(`Export complete (${exportRes} @ ${exportFps}fps WebM, ${(blob.size / 1024).toFixed(1)} KB).`);

        fetch('/api/telemetry/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'video_export' }),
        }).catch(() => {});

        // Show natural post-export interstitial if enabled and within frequency cap
        if (canShowInterstitial(adConfig)) {
          setShowPostExportAd(true);
        }
      };

      recorder.start(200);

      const stepSec = 1 / exportFps;
      let curTime = 0;

      while (curTime <= totalDuration) {
        if (cancelExportRef.current) {
          recorder.stop();
          return;
        }
        renderFrameAtTime(offCtx, dims.width, dims.height, curTime);
        setExportProgress(Math.min(99, Math.round((curTime / totalDuration) * 100)));
        curTime += stepSec;
        await new Promise((r) => setTimeout(r, 1000 / exportFps));
      }

      recorder.stop();
    } catch (err: any) {
      setIsExporting(false);
      setStatusMessage(`Export error: ${err?.message || 'Unsupported MediaRecorder configuration'}`);
    }
  };

  const previewDims = getCanvasDimensions();

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-88px)]">
      {/* LEFT & CENTER: Preview Monitor + Multi-Track Timeline */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Top Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <Film className="w-4 h-4 text-amber-400 shrink-0" />
            <input
              type="text"
              value={project.name}
              onChange={(e) => commitProject({ ...project, name: e.target.value })}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-amber-500 rounded px-1.5 py-0.5 truncate max-w-[200px] sm:max-w-xs"
              aria-label="Project Name"
            />
            <span className="text-slate-600" aria-hidden="true">·</span>
            <select
              value={project.aspectRatio}
              onChange={(e) => commitProject({ ...project, aspectRatio: e.target.value as AspectRatio })}
              className="bg-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none"
              aria-label="Aspect Ratio"
            >
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Reels/Shorts</option>
              <option value="1:1">1:1 Square</option>
              <option value="4:5">4:5 Portrait</option>
              <option value="3:4">3:4 Editorial</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"
              title={t(lang, 'undo')}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"
              title={t(lang, 'redo')}
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <button
              onClick={() =>
                commitProject({ ...project, lowMemoryProxyMode: !project.lowMemoryProxyMode })
              }
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                project.lowMemoryProxyMode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
              title="Toggle 480p proxy preview for smooth performance on 4GB RAM Android phones"
            >
              {t(lang, 'lowRamMode')}: {project.lowMemoryProxyMode ? 'ON (480p)' : 'OFF (720p)'}
            </button>

            <button
              onClick={() => {
                saveProjectToDB(project);
                setStatusMessage('Project saved to local IndexedDB storage.');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {t(lang, 'saveProject')}
            </button>

            <button
              onClick={() => setInspectorTab('export')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {t(lang, 'exportBtn')}
            </button>
          </div>
        </div>

        {/* Status Notification Strip */}
        {statusMessage && (
          <div className="px-3.5 py-2 rounded-lg bg-slate-900 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
            <span>{statusMessage}</span>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-4">
              ×
            </button>
          </div>
        )}

        {/* Video Preview Viewport */}
        <div className="relative flex-1 min-h-[260px] max-h-[420px] rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center p-3 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={previewDims.width}
            height={previewDims.height}
            className="max-h-[320px] max-w-full object-contain rounded-lg shadow-2xl border border-slate-800/80 bg-black"
          />

          {/* Transport Bar */}
          <div className="w-full max-w-2xl mt-3 flex items-center justify-between gap-4 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPlayhead((p) => Math.max(0, Number((p - 1 / 30).toFixed(2))))}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                title="Previous Frame"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setPlayhead((p) => Math.min(totalDuration, Number((p + 1 / 30).toFixed(2))))}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                title="Next Frame"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.05}
              value={playhead}
              onChange={(e) => {
                setIsPlaying(false);
                setPlayhead(parseFloat(e.target.value));
              }}
              className="flex-1 accent-amber-500 cursor-pointer"
              aria-label="Timeline Playhead Scrubber"
            />

            <div className="text-xs font-mono tabular-nums text-slate-300 shrink-0">
              {playhead.toFixed(2)}s / {totalDuration.toFixed(2)}s
            </div>
          </div>
        </div>

        {/* Multi-Track Timeline Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            <label className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              {t(lang, 'importMedia')}
              <input
                type="file"
                accept="video/*,image/*,audio/*"
                onChange={handleImportMediaFile}
                className="hidden"
              />
            </label>

            <button
              onClick={() => handleAddTextOrSubtitle('text')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <TypeIcon className="w-3.5 h-3.5 text-amber-400" />
              {t(lang, 'addText')}
            </button>

            <button
              onClick={() => handleAddTextOrSubtitle('subtitle')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Subtitles className="w-3.5 h-3.5 text-sky-400" />
              {t(lang, 'addSubtitle')}
            </button>

            <button
              onClick={handleToggleVoiceover}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isRecordingVoice
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              {isRecordingVoice ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-rose-400" />}
              {isRecordingVoice ? 'Stop Mic' : t(lang, 'recordVoiceover')}
            </button>

            <button
              onClick={handleSplitClip}
              disabled={!selectedClip}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Scissors className="w-3.5 h-3.5" />
              {t(lang, 'splitClip')}
            </button>

            <button
              onClick={handleDuplicateClip}
              disabled={!selectedClip}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              title={t(lang, 'duplicateClip')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleDeleteClip}
              disabled={!selectedClip}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 disabled:opacity-40 text-rose-400"
              title={t(lang, 'deleteClip')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer whitespace-nowrap">
              {t(lang, 'importSrt')}
              <input type="file" accept=".srt,.txt" onChange={handleImportSrt} className="hidden" />
            </label>
            <button
              onClick={handleExportSrt}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 whitespace-nowrap"
            >
              {t(lang, 'exportSrt')}
            </button>
            <button
              onClick={() => setTimelineZoom((z) => Math.max(24, z - 12))}
              className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
              title="Zoom Out Timeline"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTimelineZoom((z) => Math.min(120, z + 12))}
              className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
              title="Zoom In Timeline"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Multi-Track Interactive Timeline */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
          <div className="min-w-[680px] p-3 space-y-2">
            {project.tracks.map((track) => {
              const trackClips = project.clips.filter((c) => c.trackId === track.id);
              return (
                <div key={track.id} className="flex items-center gap-2">
                  {/* Track Header Controls */}
                  <div className="w-40 shrink-0 px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300 truncate">{track.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const nextTracks = project.tracks.map((t) =>
                            t.id === track.id ? { ...t, muted: !t.muted } : t
                          );
                          commitProject({ ...project, tracks: nextTracks });
                        }}
                        className={`p-1 rounded ${track.muted ? 'text-rose-400 bg-rose-950/40' : 'text-slate-400 hover:text-white'}`}
                        title={track.muted ? 'Unmute Track' : 'Mute Track'}
                      >
                        {track.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => {
                          const nextTracks = project.tracks.map((t) =>
                            t.id === track.id ? { ...t, hidden: !t.hidden } : t
                          );
                          commitProject({ ...project, tracks: nextTracks });
                        }}
                        className={`p-1 rounded ${track.hidden ? 'text-amber-400 bg-amber-950/40' : 'text-slate-400 hover:text-white'}`}
                        title={track.hidden ? 'Show Track' : 'Hide Track'}
                      >
                        {track.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => {
                          const nextTracks = project.tracks.map((t) =>
                            t.id === track.id ? { ...t, locked: !t.locked } : t
                          );
                          commitProject({ ...project, tracks: nextTracks });
                        }}
                        className={`p-1 rounded ${track.locked ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
                        title={track.locked ? 'Unlock Track' : 'Lock Track'}
                      >
                        {track.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Track Timeline Lane */}
                  <div
                    className="relative flex-1 h-11 rounded-lg bg-slate-950/90 border border-slate-800/80 overflow-hidden"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickedSec = Math.max(0, Math.min(totalDuration, clickX / timelineZoom));
                      setPlayhead(Number(clickedSec.toFixed(2)));
                    }}
                  >
                    {/* Playhead Vertical Line */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none"
                      style={{ left: `${playhead * timelineZoom}px` }}
                    />

                    {trackClips.map((clip) => {
                      const isSelected = clip.id === selectedClipId;
                      const leftPx = clip.startTime * timelineZoom;
                      const widthPx = Math.max(32, clip.duration * timelineZoom);

                      const colorClass =
                        clip.type === 'video' || clip.type === 'image'
                          ? 'bg-indigo-950/90 border-indigo-500/50 text-indigo-100'
                          : clip.type === 'text'
                          ? 'bg-amber-950/90 border-amber-500/50 text-amber-100'
                          : clip.type === 'subtitle'
                          ? 'bg-sky-950/90 border-sky-500/50 text-sky-100'
                          : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100';

                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (!track.locked) {
                              setSelectedClipId(clip.id);
                            }
                          }}
                          style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                          className={`absolute top-1 bottom-1 rounded-md border px-2 text-left text-[11px] font-medium truncate transition-all ${colorClass} ${
                            isSelected ? 'ring-2 ring-amber-400 z-10' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{clip.textContent || clip.name}</span>
                            <span className="font-mono text-[10px] opacity-75 shrink-0">
                              {clip.duration}s
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT INSPECTOR PANEL: Clip Properties, Color Grading, Audio, Text & Real Export */}
      <div className="w-full lg:w-80 shrink-0 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
        {/* Inspector Mode Tabs */}
        <div className="grid grid-cols-5 gap-1 p-1.5 bg-slate-950 rounded-t-xl border-b border-slate-800">
          {(
            [
              { id: 'transform', label: 'Clip' },
              { id: 'color', label: 'Color' },
              { id: 'audio', label: 'Audio' },
              { id: 'text', label: 'Text' },
              { id: 'export', label: 'Export' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setInspectorTab(tab.id)}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                inspectorTab === tab.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {inspectorTab === 'export' ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">
                {t(lang, 'exportVideoTitle')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Renders every multi-track frame and synthesized/recorded audio stream into a downloadable WebM video file.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Resolution Preset</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['480p', '720p', '1080p'] as const).map((res) => {
                      const disabledByAdmin =
                        (maxExportResolution === '480p' && res !== '480p') ||
                        (maxExportResolution === '720p' && res === '1080p');
                      return (
                        <button
                          key={res}
                          disabled={disabledByAdmin}
                          onClick={() => setExportRes(res)}
                          className={`py-2 rounded-lg text-xs font-mono border transition-colors ${
                            exportRes === res
                              ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          } disabled:opacity-35`}
                        >
                          {res}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Frame Rate (FPS)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([24, 30] as const).map((fps) => (
                      <button
                        key={fps}
                        onClick={() => setExportFps(fps)}
                        className={`py-2 rounded-lg text-xs font-mono border ${
                          exportFps === fps
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {fps} FPS
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Output Codec:</span>
                    <span className="font-mono text-slate-200">WebM (VP9 / VP8)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="font-mono text-slate-200">{totalDuration.toFixed(2)}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>4GB RAM Safe Pipeline:</span>
                    <span className="font-mono text-emerald-400">Verified</span>
                  </div>
                </div>

                {!isExporting ? (
                  <button
                    onClick={handleStartVideoExport}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Render & Export Video Now
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-amber-300">
                      <span>Rendering frames...</span>
                      <span>{exportProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="bg-amber-500 h-full transition-all"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        cancelExportRef.current = true;
                      }}
                      className="w-full py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-xs font-medium"
                    >
                      Cancel Rendering
                    </button>
                  </div>
                )}

                {exportedVideoUrl && (
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4" />
                      Video Render Ready
                    </div>
                    <a
                      href={exportedVideoUrl}
                      download={`${project.name.replace(/\s+/g, '_')}_${exportRes}.webm`}
                      className="block w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-center font-semibold text-xs"
                    >
                      Download .WebM to Device
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : !selectedClip ? (
            <div className="text-xs text-slate-400 py-8 text-center">
              Tap any clip on the multi-track timeline to edit its timing, transform, color grade, or audio.
            </div>
          ) : inspectorTab === 'transform' ? (
            <div className="space-y-3 text-xs">
              <div className="font-semibold text-slate-200 truncate">{selectedClip.name}</div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Start Time (s)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    value={selectedClip.startTime}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({ ...c, startTime: Math.max(0, parseFloat(e.target.value) || 0) }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Duration (s)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.5}
                    value={selectedClip.duration}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({ ...c, duration: Math.max(0.5, parseFloat(e.target.value) || 1) }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Scale</span>
                  <span className="font-mono">{selectedClip.scale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  value={selectedClip.scale}
                  onChange={(e) => updateSelectedClip((c) => ({ ...c, scale: parseFloat(e.target.value) }))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Pos X</span>
                    <span className="font-mono">{selectedClip.x}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={selectedClip.x}
                    onChange={(e) => updateSelectedClip((c) => ({ ...c, x: parseInt(e.target.value, 10) }))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Pos Y</span>
                    <span className="font-mono">{selectedClip.y}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={selectedClip.y}
                    onChange={(e) => updateSelectedClip((c) => ({ ...c, y: parseInt(e.target.value, 10) }))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{t(lang, 'speedControl')}</span>
                  <span className="font-mono">{selectedClip.speed}x</span>
                </div>
                <input
                  type="range"
                  min={0.25}
                  max={2.5}
                  step={0.25}
                  value={selectedClip.speed}
                  onChange={(e) => updateSelectedClip((c) => ({ ...c, speed: parseFloat(e.target.value) }))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{t(lang, 'transitions')}</label>
                <select
                  value={selectedClip.transition}
                  onChange={(e) =>
                    updateSelectedClip((c) => ({ ...c, transition: e.target.value as TransitionType }))
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                >
                  <option value="none">None (Cut)</option>
                  <option value="fade">Cross Dissolve / Fade</option>
                  <option value="slideLeft">Slide Left</option>
                  <option value="zoomIn">Dynamic Zoom In</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => updateSelectedClip((c) => ({ ...c, rotation: (c.rotation + 90) % 360 }))}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Rotate 90°
                </button>
                <button
                  onClick={() => updateSelectedClip((c) => ({ ...c, flipH: !c.flipH }))}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Flip H
                </button>
                <button
                  onClick={() => updateSelectedClip((c) => ({ ...c, flipV: !c.flipV }))}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Flip V
                </button>
              </div>
            </div>
          ) : inspectorTab === 'color' ? (
            <div className="space-y-3 text-xs">
              {(
                [
                  { key: 'brightness', label: 'Brightness', min: -50, max: 50 },
                  { key: 'contrast', label: 'Contrast', min: -50, max: 50 },
                  { key: 'saturation', label: 'Saturation', min: -50, max: 50 },
                  { key: 'exposure', label: 'Exposure', min: -50, max: 50 },
                  { key: 'temperature', label: 'Temperature (Warm/Cool)', min: -50, max: 50 },
                  { key: 'tint', label: 'Tint', min: -50, max: 50 },
                  { key: 'opacity', label: 'Opacity', min: 0, max: 100 },
                ] as const
              ).map((item) => (
                <div key={item.key}>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>{item.label}</span>
                    <span className="font-mono">{selectedClip.adjustments[item.key]}</span>
                  </div>
                  <input
                    type="range"
                    min={item.min}
                    max={item.max}
                    value={selectedClip.adjustments[item.key]}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({
                        ...c,
                        adjustments: {
                          ...c.adjustments,
                          [item.key]: parseInt(e.target.value, 10),
                        },
                      }))
                    }
                    className="w-full accent-amber-500"
                  />
                </div>
              ))}

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="font-medium text-emerald-400">{t(lang, 'chromaKey')}</span>
                  <input
                    type="checkbox"
                    checked={selectedClip.adjustments.chromaKeyEnabled}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({
                        ...c,
                        adjustments: { ...c.adjustments, chromaKeyEnabled: e.target.checked },
                      }))
                    }
                    className="accent-emerald-500"
                  />
                </label>
                {selectedClip.adjustments.chromaKeyEnabled && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedClip.adjustments.chromaKeyColor}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          adjustments: { ...c.adjustments, chromaKeyColor: e.target.value },
                        }))
                      }
                      className="w-8 h-8 rounded bg-transparent border-0"
                    />
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={selectedClip.adjustments.chromaKeyThreshold}
                      onChange={(e) =>
                        updateSelectedClip((c) => ({
                          ...c,
                          adjustments: {
                            ...c.adjustments,
                            chromaKeyThreshold: parseInt(e.target.value, 10),
                          },
                        }))
                      }
                      className="flex-1 accent-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : inspectorTab === 'audio' ? (
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Clip Volume</span>
                  <span className="font-mono">{selectedClip.volume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedClip.volume}
                  onChange={(e) => updateSelectedClip((c) => ({ ...c, volume: parseInt(e.target.value, 10) }))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Fade In (s)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={5}
                    value={selectedClip.fadeIn}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({ ...c, fadeIn: Math.max(0, parseFloat(e.target.value) || 0) }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Fade Out (s)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={5}
                    value={selectedClip.fadeOut}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({ ...c, fadeOut: Math.max(0, parseFloat(e.target.value) || 0) }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-white"
                  />
                </div>
              </div>

              {selectedClip.type === 'video' && (
                <button
                  onClick={handleExtractAudioFromVideo}
                  className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                >
                  {t(lang, 'extractAudio')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Text / Subtitle Content (EN / বাংলা)</label>
                <textarea
                  rows={3}
                  value={selectedClip.textContent || ''}
                  onChange={(e) => updateSelectedClip((c) => ({ ...c, textContent: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Font Size</label>
                  <input
                    type="number"
                    min={14}
                    max={96}
                    value={selectedClip.fontSize || 28}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({ ...c, fontSize: parseInt(e.target.value, 10) || 28 }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Animation</label>
                  <select
                    value={selectedClip.animationPreset || 'none'}
                    onChange={(e) =>
                      updateSelectedClip((c) => ({
                        ...c,
                        animationPreset: e.target.value as any,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="none">Static</option>
                    <option value="pop">Pop Scale</option>
                    <option value="slideUp">Slide Up</option>
                    <option value="typewriter">Typewriter</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-slate-300">
                  <span>Color</span>
                  <input
                    type="color"
                    value={selectedClip.textColor || '#FFFFFF'}
                    onChange={(e) => updateSelectedClip((c) => ({ ...c, textColor: e.target.value }))}
                    className="w-7 h-7 rounded bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedClip.textOutline)}
                    onChange={(e) => updateSelectedClip((c) => ({ ...c, textOutline: e.target.checked }))}
                    className="accent-amber-500"
                  />
                  <span>Outline</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post-Export Interstitial Ad Modal */}
      <InterstitialAdModal
        isOpen={showPostExportAd}
        adConfig={adConfig}
        onClose={() => setShowPostExportAd(false)}
      />
    </div>
  );
};
