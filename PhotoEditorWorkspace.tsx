import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Download,
  Undo2,
  Redo2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Eye,
  Sparkles,
  Layers,
  Type as TypeIcon,
  Paintbrush,
  Trash2,
  Save,
  Sliders,
  Crop,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  PhotoProject,
  PhotoLayer,
  AspectRatio,
  Language,
  SharedMediaAsset,
} from '../types/studio';
import { t } from '../i18n/translations';
import { saveProjectToDB, saveMediaAssetToDB } from '../services/storageService';
import { PublicAdConfig, canShowInterstitial, InterstitialAdModal } from './AdPlacements';

interface PhotoEditorProps {
  project: PhotoProject;
  onProjectChange: (updated: PhotoProject) => void;
  lang: Language;
  adConfig: PublicAdConfig | null;
  aiPhotoToolsEnabled: boolean;
  onSaveAssetToLibrary: (asset: SharedMediaAsset) => void;
}

export const PhotoEditorWorkspace: React.FC<PhotoEditorProps> = ({
  project,
  onProjectChange,
  lang,
  adConfig,
  aiPhotoToolsEnabled,
  onSaveAssetToLibrary,
}) => {
  const [history, setHistory] = useState<PhotoProject[]>([project]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'crop' | 'adjust' | 'layers' | 'ai' | 'export'>('adjust');
  const [isComparingOriginal, setIsComparingOriginal] = useState<boolean>(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(project.layers[0]?.id || null);

  // Brush drawing mode
  const [isBrushMode, setIsBrushMode] = useState<boolean>(false);
  const [brushColor, setBrushColor] = useState<string>('#F59E0B');
  const [brushSize, setBrushSize] = useState<number>(8);
  const currentBrushPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const isDrawingStrokeRef = useRef<boolean>(false);

  // AI Smart Grade state
  const [isRunningAi, setIsRunningAi] = useState<boolean>(false);
  const [aiCritique, setAiCritique] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Export settings
  const [exportFormat, setExportFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [exportQuality, setExportQuality] = useState<number>(92);
  const [exportScale, setExportScale] = useState<number>(1);
  const [exportedDataUrl, setExportedDataUrl] = useState<string | null>(null);
  const [showPostExportAd, setShowPostExportAd] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const commitProject = useCallback(
    (nextProj: PhotoProject) => {
      const sliced = history.slice(0, historyIndex + 1);
      const nextHist = [...sliced, nextProj].slice(-25);
      setHistory(nextHist);
      setHistoryIndex(nextHist.length - 1);
      onProjectChange(nextProj);
      saveProjectToDB(nextProj).catch(() => {});
    },
    [history, historyIndex, onProjectChange]
  );

  const handleUndo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      onProjectChange(history[idx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      onProjectChange(history[idx]);
    }
  };

  // Load source image into HTMLImageElement
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImageRef.current = img;
      renderPhotoCanvas();
    };
    img.src = project.sourceDataUrl;
  }, [project.sourceDataUrl]);

  // Compute target aspect dimensions
  const getOutputDimensions = (scaleMultiplier = 1) => {
    const baseW = project.originalWidth || 1200;
    const baseH = project.originalHeight || 900;

    if (project.aspectRatio === 'free') {
      return {
        width: Math.round(baseW * scaleMultiplier),
        height: Math.round(baseH * scaleMultiplier),
      };
    }

    const [rw, rh] = project.aspectRatio.split(':').map(Number);
    const targetRatio = rw / rh;
    const currentRatio = baseW / baseH;

    let cropW = baseW;
    let cropH = baseH;
    if (currentRatio > targetRatio) {
      cropW = Math.round(baseH * targetRatio);
    } else {
      cropH = Math.round(baseW / targetRatio);
    }
    return {
      width: Math.round(cropW * scaleMultiplier),
      height: Math.round(cropH * scaleMultiplier),
    };
  };

  const renderPhotoCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img) return;

    const dims = getOutputDimensions(1);
    canvas.width = dims.width;
    canvas.height = dims.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = project.canvasBgColor || '#0B0F17';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const adj = project.adjustments;

    // If not holding "Compare Original", apply all adjustments & transforms
    if (!isComparingOriginal) {
      let b = 100 + adj.brightness + adj.exposure * 0.9 + adj.highlights * 0.3;
      let c = 100 + adj.contrast - adj.shadows * 0.35;
      let s = adj.bw ? 0 : 100 + adj.saturation;
      let sepia = 0;
      let hue = adj.tint * 1.2;

      const intensity = adj.filterIntensity / 100;
      if (adj.filterPreset === 'cinematic') {
        c += 18 * intensity;
        s -= 12 * intensity;
      } else if (adj.filterPreset === 'warm_gold') {
        sepia += 28 * intensity;
        b += 6 * intensity;
      } else if (adj.filterPreset === 'cool_slate') {
        hue -= 18 * intensity;
        c += 10 * intensity;
      } else if (adj.filterPreset === 'high_contrast') {
        c += 35 * intensity;
      } else if (adj.filterPreset === 'vintage_film') {
        sepia += 40 * intensity;
        c -= 8 * intensity;
      }

      ctx.filter = `brightness(${Math.max(10, b)}%) contrast(${Math.max(10, c)}%) saturate(${Math.max(0, s)}%) sepia(${sepia}%) hue-rotate(${hue}deg) blur(${adj.blur}px)`;
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    const totalAngle = isComparingOriginal ? 0 : project.rotation + project.straightenAngle;
    ctx.rotate((totalAngle * Math.PI) / 180);
    if (!isComparingOriginal) {
      ctx.scale(project.flipH ? -1 : 1, project.flipV ? -1 : 1);
    }

    // Draw image centered covering the aspect frame
    const scaleCover = Math.max(canvas.width / img.width, canvas.height / img.height);
    const drawW = img.width * scaleCover;
    const drawH = img.height * scaleCover;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    ctx.filter = 'none';

    if (!isComparingOriginal) {
      // Temperature & Tint color balance overlay
      if (adj.temperature !== 0) {
        ctx.fillStyle =
          adj.temperature > 0
            ? `rgba(245, 158, 11, ${Math.min(0.32, adj.temperature / 140)})`
            : `rgba(56, 189, 248, ${Math.min(0.32, Math.abs(adj.temperature) / 140)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Vignette radial gradient
      if (adj.vignette > 0) {
        const outerR = Math.hypot(canvas.width, canvas.height) * 0.55;
        const innerR = outerR * Math.max(0.15, 1 - adj.vignette / 110);
        const vig = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          innerR,
          canvas.width / 2,
          canvas.height / 2,
          outerR
        );
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, adj.vignette / 100)})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Render Non-Destructive Layers (Text, Stickers, Shapes, Brush strokes)
      for (const layer of project.layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));

        if (layer.type === 'brush' && layer.points && layer.points.length > 1) {
          ctx.strokeStyle = layer.color || '#F59E0B';
          ctx.lineWidth = layer.strokeWidth || 8;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          layer.points.forEach((pt, idx) => {
            const px = (pt.x / 100) * canvas.width;
            const py = (pt.y / 100) * canvas.height;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        } else {
          const lx = (layer.x / 100) * canvas.width;
          const ly = (layer.y / 100) * canvas.height;
          ctx.translate(lx, ly);
          ctx.rotate((layer.rotation * Math.PI) / 180);
          ctx.scale(layer.scale, layer.scale);

          if (layer.type === 'text' || layer.type === 'sticker') {
            const fSize = layer.fontSize || 42;
            ctx.font = `700 ${fSize}px "${layer.fontFamily || 'Outfit'}", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (layer.bgColor && layer.bgColor !== 'transparent') {
              const m = ctx.measureText(layer.content || '');
              ctx.fillStyle = layer.bgColor;
              ctx.fillRect(-m.width / 2 - 16, -fSize / 2 - 10, m.width + 32, fSize + 20);
            }
            ctx.lineWidth = Math.max(2, Math.round(fSize * 0.08));
            ctx.strokeStyle = '#000000AA';
            ctx.strokeText(layer.content || '', 0, 0);
            ctx.fillStyle = layer.color || '#FFFFFF';
            ctx.fillText(layer.content || '', 0, 0);
          } else if (layer.type === 'shape') {
            ctx.fillStyle = layer.color || '#F59E0B';
            ctx.beginPath();
            ctx.roundRect(-80, -45, 160, 90, 16);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // Frame Border
      if (project.borderWidth > 0) {
        ctx.strokeStyle = project.borderColor || '#FFFFFF';
        ctx.lineWidth = project.borderWidth * 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }
    }

    ctx.restore();
  }, [project, isComparingOriginal]);

  useEffect(() => {
    renderPhotoCanvas();
  }, [renderPhotoCanvas]);

  // Handle Photo Import from Android / System file picker
  const handleImportPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please select a supported image file (JPEG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const nextProj: PhotoProject = {
          ...project,
          name: file.name.replace(/\.[^/.]+$/, ''),
          sourceDataUrl: dataUrl,
          originalWidth: img.width,
          originalHeight: img.height,
        };
        commitProject(nextProj);
        setStatusMessage(`Imported ${file.name} (${img.width}×${img.height}px) — Original preserved.`);

        const asset: SharedMediaAsset = {
          id: `ast_pho_${Date.now()}`,
          name: file.name,
          type: 'image',
          mimeType: file.type,
          sizeBytes: file.size,
          width: img.width,
          height: img.height,
          dataUrl,
          folder: 'Camera',
          createdAt: new Date().toISOString(),
        };
        saveMediaAssetToDB(asset).catch(() => {});
        onSaveAssetToLibrary(asset);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Interactive Brush Stroke Drawing on Canvas
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isBrushMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    isDrawingStrokeRef.current = true;
    currentBrushPointsRef.current = [{ x: xPct, y: yPct }];
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isBrushMode || !isDrawingStrokeRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    currentBrushPointsRef.current.push({ x: xPct, y: yPct });

    // Live feedback stroke
    const ctx = canvasRef.current.getContext('2d');
    if (ctx && currentBrushPointsRef.current.length >= 2) {
      const pts = currentBrushPointsRef.current;
      const p1 = pts[pts.length - 2];
      const p2 = pts[pts.length - 1];
      ctx.save();
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo((p1.x / 100) * canvasRef.current.width, (p1.y / 100) * canvasRef.current.height);
      ctx.lineTo((p2.x / 100) * canvasRef.current.width, (p2.y / 100) * canvasRef.current.height);
      ctx.stroke();
      ctx.restore();
    }
  };

  const handleCanvasPointerUp = () => {
    if (!isBrushMode || !isDrawingStrokeRef.current) return;
    isDrawingStrokeRef.current = false;
    if (currentBrushPointsRef.current.length > 1) {
      const brushLayer: PhotoLayer = {
        id: `lyr_brush_${Date.now()}`,
        type: 'brush',
        name: `Brush Stroke #${project.layers.length + 1}`,
        visible: true,
        opacity: 100,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        color: brushColor,
        strokeWidth: brushSize,
        points: [...currentBrushPointsRef.current],
      };
      commitProject({ ...project, layers: [...project.layers, brushLayer] });
      setSelectedLayerId(brushLayer.id);
    }
    currentBrushPointsRef.current = [];
  };

  // Add Layer (Text, Sticker, Shape)
  const handleAddLayer = (type: 'text' | 'sticker' | 'shape') => {
    const newLayer: PhotoLayer = {
      id: `lyr_${type}_${Date.now()}`,
      type,
      name: type === 'text' ? 'Typography Layer' : type === 'sticker' ? 'Badge Sticker' : 'Accent Shape',
      visible: true,
      opacity: 100,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      content:
        type === 'text'
          ? lang === 'bn'
            ? 'রুট কার্ট ফটো স্টুডিও'
            : 'ROOT CART EDITORIAL'
          : type === 'sticker'
          ? '★ PRO STUDIO 2026 ★'
          : '',
      color: type === 'sticker' ? '#F59E0B' : '#FFFFFF',
      bgColor: type === 'sticker' ? '#0F172ACC' : 'transparent',
      fontSize: type === 'text' ? 40 : 28,
      fontFamily: 'Outfit',
    };
    commitProject({ ...project, layers: [...project.layers, newLayer] });
    setSelectedLayerId(newLayer.id);
  };

  // Run Real Server-Side Gemini Multimodal Photo Analysis & Auto-Grade
  const handleRunAiSmartGrade = async () => {
    if (!canvasRef.current) return;
    setIsRunningAi(true);
    setAiCritique(null);
    try {
      const jpegDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
      const res = await fetch('/api/ai/photo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: jpegDataUrl,
          mimeType: 'image/jpeg',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(data.error || 'AI Photo Analysis failed.');
      } else if (data.analysis) {
        const rec = data.analysis.recommendedAdjustments || {};
        commitProject({
          ...project,
          adjustments: {
            ...project.adjustments,
            brightness: rec.brightness ?? project.adjustments.brightness,
            contrast: rec.contrast ?? project.adjustments.contrast,
            exposure: rec.exposure ?? project.adjustments.exposure,
            saturation: rec.saturation ?? project.adjustments.saturation,
            temperature: rec.temperature ?? project.adjustments.temperature,
            tint: rec.tint ?? project.adjustments.tint,
            sharpness: rec.sharpness ?? project.adjustments.sharpness,
            vignette: rec.vignette ?? project.adjustments.vignette,
          },
        });
        setAiCritique(`${data.analysis.subjectDetected}: ${data.analysis.critiqueSummary}`);
        setStatusMessage('Applied Gemini 3.8 Flash recommended color & light grading.');
      }
    } catch (err: any) {
      setStatusMessage(err?.message || 'Network error during AI photo analysis.');
    } finally {
      setIsRunningAi(false);
    }
  };

  // Export high-resolution photo copy without overwriting original
  const handleExportPhoto = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL(exportFormat, exportQuality / 100);
    setExportedDataUrl(dataUrl);

    const ext = exportFormat === 'image/png' ? 'png' : exportFormat === 'image/webp' ? 'webp' : 'jpg';
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${project.name.replace(/\s+/g, '_')}_edited.${ext}`;
    a.click();

    setStatusMessage(`Exported separate copy as .${ext.toUpperCase()} (${canvasRef.current.width}×${canvasRef.current.height}px).`);

    fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'photo_export' }),
    }).catch(() => {});

    if (canShowInterstitial(adConfig)) {
      setShowPostExportAd(true);
    }
  };

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-88px)]">
      {/* LEFT & CENTER: Photo Viewport + Top Bar */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {/* Top Photo Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
            <input
              type="text"
              value={project.name}
              onChange={(e) => commitProject({ ...project, name: e.target.value })}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-amber-500 rounded px-1.5 py-0.5 truncate max-w-[200px]"
            />
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-xs font-mono text-slate-400">
              {project.originalWidth}×{project.originalHeight}px
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              Import Photo
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImportPhoto} className="hidden" />
            </label>

            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              title={t(lang, 'undo')}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
              title={t(lang, 'redo')}
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <button
              onPointerDown={() => setIsComparingOriginal(true)}
              onPointerUp={() => setIsComparingOriginal(false)}
              onPointerLeave={() => setIsComparingOriginal(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 select-none whitespace-nowrap shrink-0 ${
                isComparingOriginal
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {t(lang, 'compareOriginal')}
            </button>

            <button
              onClick={() => {
                saveProjectToDB(project);
                setStatusMessage('Photo project saved to local IndexedDB.');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {t(lang, 'saveProject')}
            </button>

            <button
              onClick={() => setActiveTab('export')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {t(lang, 'exportBtn')}
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="px-3.5 py-2 rounded-lg bg-slate-900 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
            <span>{statusMessage}</span>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-4">
              ×
            </button>
          </div>
        )}

        {/* Interactive Photo Canvas Viewport */}
        <div className="relative flex-1 min-h-[380px] rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center p-4 overflow-hidden">
          {isComparingOriginal && (
            <div className="absolute top-4 left-4 z-10 px-3 py-1 rounded-md bg-black/80 text-amber-300 text-xs font-mono">
              ORIGINAL UNEDITED IMAGE
            </div>
          )}
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            className={`max-h-[520px] max-w-full object-contain rounded-lg shadow-2xl border border-slate-800/80 ${
              isBrushMode ? 'cursor-crosshair' : 'cursor-default'
            }`}
          />
        </div>
      </div>

      {/* RIGHT INSPECTOR: Crop, Adjustments, Layers, AI Photo Tools & Export */}
      <div className="w-full lg:w-84 shrink-0 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
        <div className="grid grid-cols-5 gap-1 p-1.5 bg-slate-950 rounded-t-xl border-b border-slate-800">
          {(
            [
              { id: 'crop', label: 'Crop' },
              { id: 'adjust', label: 'Adjust' },
              { id: 'layers', label: 'Layers' },
              { id: 'ai', label: 'AI Photo' },
              { id: 'export', label: 'Export' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== 'layers') setIsBrushMode(false);
              }}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {activeTab === 'crop' && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 mb-2">Aspect Ratio Presets</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['free', '1:1', '4:5', '3:4', '9:16', '16:9'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => commitProject({ ...project, aspectRatio: ratio })}
                      className={`py-2 rounded-lg font-mono border ${
                        project.aspectRatio === ratio
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {ratio === 'free' ? 'Original' : ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Straighten Horizon</span>
                  <span className="font-mono">{project.straightenAngle}°</span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={project.straightenAngle}
                  onChange={(e) =>
                    commitProject({ ...project, straightenAngle: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => commitProject({ ...project, rotation: (project.rotation + 90) % 360 })}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                </button>
                <button
                  onClick={() => commitProject({ ...project, flipH: !project.flipH })}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" /> Flip H
                </button>
                <button
                  onClick={() => commitProject({ ...project, flipV: !project.flipV })}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5"
                >
                  <FlipVertical className="w-3.5 h-3.5" /> Flip V
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Frame Border Width</span>
                  <span className="font-mono">{project.borderWidth}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={project.borderWidth}
                  onChange={(e) =>
                    commitProject({ ...project, borderWidth: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          )}

          {activeTab === 'adjust' && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1.5">Preset Filters</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'none', label: 'Normal' },
                      { id: 'cinematic', label: 'Cinematic' },
                      { id: 'warm_gold', label: 'Warm Gold' },
                      { id: 'cool_slate', label: 'Cool Slate' },
                      { id: 'high_contrast', label: 'Punchy' },
                      { id: 'vintage_film', label: 'Vintage' },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() =>
                        commitProject({
                          ...project,
                          adjustments: { ...project.adjustments, filterPreset: preset.id },
                        })
                      }
                      className={`py-1.5 rounded-lg border text-[11px] ${
                        project.adjustments.filterPreset === preset.id
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {(
                [
                  { key: 'brightness', label: 'Brightness', min: -50, max: 50 },
                  { key: 'contrast', label: 'Contrast', min: -50, max: 50 },
                  { key: 'exposure', label: 'Exposure', min: -50, max: 50 },
                  { key: 'highlights', label: 'Highlights', min: -50, max: 50 },
                  { key: 'shadows', label: 'Shadows', min: -50, max: 50 },
                  { key: 'saturation', label: 'Saturation', min: -50, max: 50 },
                  { key: 'temperature', label: 'Temperature', min: -50, max: 50 },
                  { key: 'tint', label: 'Tint', min: -50, max: 50 },
                  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
                  { key: 'blur', label: 'Depth Blur', min: 0, max: 15 },
                ] as const
              ).map((slider) => (
                <div key={slider.key}>
                  <div className="flex justify-between text-slate-400 mb-0.5">
                    <span>{slider.label}</span>
                    <span className="font-mono">{project.adjustments[slider.key]}</span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    value={project.adjustments[slider.key]}
                    onChange={(e) =>
                      commitProject({
                        ...project,
                        adjustments: {
                          ...project.adjustments,
                          [slider.key]: parseInt(e.target.value, 10),
                        },
                      })
                    }
                    className="w-full accent-amber-500"
                  />
                </div>
              ))}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={project.adjustments.bw}
                    onChange={(e) =>
                      commitProject({
                        ...project,
                        adjustments: { ...project.adjustments, bw: e.target.checked },
                      })
                    }
                    className="accent-amber-500"
                  />
                  <span>Black & White Monochrome</span>
                </label>

                <button
                  onClick={() =>
                    commitProject({
                      ...project,
                      adjustments: {
                        brightness: 0,
                        contrast: 0,
                        exposure: 0,
                        highlights: 0,
                        shadows: 0,
                        saturation: 0,
                        temperature: 0,
                        tint: 0,
                        sharpness: 0,
                        blur: 0,
                        vignette: 0,
                        bw: false,
                        filterPreset: 'none',
                        filterIntensity: 100,
                      },
                    })
                  }
                  className="text-amber-400 hover:underline"
                >
                  Reset All
                </button>
              </div>
            </div>
          )}

          {activeTab === 'layers' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => handleAddLayer('text')}
                  className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1"
                >
                  <TypeIcon className="w-3.5 h-3.5 text-amber-400" /> + Text
                </button>
                <button
                  onClick={() => handleAddLayer('sticker')}
                  className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> + Badge
                </button>
                <button
                  onClick={() => setIsBrushMode((b) => !b)}
                  className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
                    isBrushMode
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <Paintbrush className="w-3.5 h-3.5" /> Brush
                </button>
              </div>

              {isBrushMode && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-amber-500/40 space-y-2">
                  <div className="text-amber-300 font-medium">
                    Draw directly on the photo canvas to add freehand brush annotations.
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={brushColor}
                      onChange={(e) => setBrushColor(e.target.value)}
                      className="w-7 h-7 rounded"
                    />
                    <input
                      type="range"
                      min={2}
                      max={32}
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                      className="flex-1 accent-amber-500"
                    />
                    <span className="font-mono">{brushSize}px</span>
                  </div>
                </div>
              )}

              {/* Layer Stack List */}
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {project.layers.map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer ${
                      selectedLayerId === layer.id
                        ? 'bg-slate-800 border-amber-500/60 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="truncate font-medium">{layer.content || layer.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          commitProject({
                            ...project,
                            layers: project.layers.map((l) =>
                              l.id === layer.id ? { ...l, visible: !l.visible } : l
                            ),
                          });
                        }}
                        className="p-1 text-slate-400 hover:text-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          commitProject({
                            ...project,
                            layers: project.layers.filter((l) => l.id !== layer.id),
                          });
                        }}
                        className="p-1 text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedLayer && selectedLayer.type !== 'brush' && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <label className="block text-slate-400">Layer Text</label>
                  <input
                    type="text"
                    value={selectedLayer.content || ''}
                    onChange={(e) =>
                      commitProject({
                        ...project,
                        layers: project.layers.map((l) =>
                          l.id === selectedLayer.id ? { ...l, content: e.target.value } : l
                        ),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-slate-400">X ({selectedLayer.x}%)</span>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={selectedLayer.x}
                        onChange={(e) =>
                          commitProject({
                            ...project,
                            layers: project.layers.map((l) =>
                              l.id === selectedLayer.id ? { ...l, x: parseInt(e.target.value, 10) } : l
                            ),
                          })
                        }
                        className="w-full accent-amber-500"
                      />
                    </div>
                    <div>
                      <span className="text-slate-400">Y ({selectedLayer.y}%)</span>
                      <input
                        type="range"
                        min={5}
                        max={95}
                        value={selectedLayer.y}
                        onChange={(e) =>
                          commitProject({
                            ...project,
                            layers: project.layers.map((l) =>
                              l.id === selectedLayer.id ? { ...l, y: parseInt(e.target.value, 10) } : l
                            ),
                          })
                        }
                        className="w-full accent-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>Gemini 3.8 Multimodal Smart Grade</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Sends the current photo frame to our protected server-side Gemini endpoint to inspect lighting, subject framing, and color cast, then applies real numeric slider adjustments.
                </p>
                <button
                  onClick={handleRunAiSmartGrade}
                  disabled={!aiPhotoToolsEnabled || isRunningAi}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold transition-colors"
                >
                  {isRunningAi ? 'Analyzing Photo with Gemini...' : t(lang, 'aiAutoAdjust')}
                </button>
              </div>

              {aiCritique && (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 leading-relaxed">
                  {aiCritique}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-slate-400">
                <div className="font-semibold text-slate-200">Transparency & Model Notice</div>
                <p>
                  Root Cart never fabricates AI photo results. Smart Grade uses real server-side <code className="text-amber-300">gemini-3.8-flash</code> vision analysis. Generative background replacement and neural upscaling require an attached paid image-generation API key.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">{t(lang, 'exportPhotoTitle')}</h3>
              <p className="text-slate-400">
                Saves your edited photo as a separate copy so your original image is never overwritten without confirmation.
              </p>

              <div>
                <label className="block text-slate-400 mb-1">Output Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { mime: 'image/jpeg', label: 'JPEG' },
                      { mime: 'image/png', label: 'PNG' },
                      { mime: 'image/webp', label: 'WebP' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.mime}
                      onClick={() => setExportFormat(f.mime)}
                      className={`py-2 rounded-lg font-mono border ${
                        exportFormat === f.mime
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {exportFormat !== 'image/png' && (
                <div>
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Compression Quality</span>
                    <span className="font-mono">{exportQuality}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    value={exportQuality}
                    onChange={(e) => setExportQuality(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500"
                  />
                </div>
              )}

              <button
                onClick={handleExportPhoto}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export Photo Copy
              </button>
            </div>
          )}
        </div>
      </div>

      <InterstitialAdModal
        isOpen={showPostExportAd}
        adConfig={adConfig}
        onClose={() => setShowPostExportAd(false)}
      />
    </div>
  );
};
