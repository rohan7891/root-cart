export type Language = 'en' | 'bn';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '3:4';

export type TransitionType = 'none' | 'fade' | 'slideLeft' | 'zoomIn' | 'wipeRight';

export interface VideoAdjustments {
  brightness: number; // -50 to 50
  contrast: number;   // -50 to 50
  saturation: number; // -50 to 50
  exposure: number;   // -50 to 50
  temperature: number;// -50 to 50
  tint: number;       // -50 to 50
  opacity: number;    // 0 to 100
  chromaKeyEnabled: boolean;
  chromaKeyColor: string; // hex e.g. #00ff00
  chromaKeyThreshold: number; // 10 to 100
}

export interface KeyframePoint {
  timeOffset: number; // seconds from clip start
  scale: number;
  x: number;
  y: number;
  opacity: number;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  type: 'video' | 'image' | 'audio' | 'text' | 'subtitle';
  name: string;
  startTime: number; // seconds on timeline
  duration: number;  // seconds on timeline
  trimStart: number; // source media offset
  sourceUrl?: string;
  sourceMimeType?: string;
  fileSize?: number;
  // Transform & visual properties
  scale: number;     // 0.2 to 3.0
  rotation: number;  // degrees
  flipH: boolean;
  flipV: boolean;
  x: number;         // normalized offset -100 to 100
  y: number;         // normalized offset -100 to 100
  speed: number;     // 0.25 to 3.0
  volume: number;    // 0 to 100
  fadeIn: number;    // seconds
  fadeOut: number;   // seconds
  transition: TransitionType;
  adjustments: VideoAdjustments;
  // Text / Subtitle specific
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  textBgColor?: string;
  textOutline?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  animationPreset?: 'none' | 'pop' | 'typewriter' | 'slideUp';
  keyframes?: KeyframePoint[];
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'overlay' | 'text' | 'subtitle' | 'audio';
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface VideoProject {
  id: string;
  name: string;
  type: 'video';
  updatedAt: string;
  createdAt: string;
  aspectRatio: AspectRatio;
  canvasBgColor: string;
  lowMemoryProxyMode: boolean;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

export interface PhotoAdjustments {
  brightness: number;  // -50 to 50
  contrast: number;    // -50 to 50
  exposure: number;    // -50 to 50
  highlights: number;  // -50 to 50
  shadows: number;     // -50 to 50
  saturation: number;  // -50 to 50
  temperature: number; // -50 to 50
  tint: number;        // -50 to 50
  sharpness: number;   // 0 to 100
  blur: number;        // 0 to 20
  vignette: number;    // 0 to 100
  bw: boolean;
  filterPreset: 'none' | 'cinematic' | 'warm_gold' | 'cool_slate' | 'high_contrast' | 'vintage_film';
  filterIntensity: number; // 0 to 100
}

export interface PhotoLayer {
  id: string;
  type: 'text' | 'sticker' | 'shape' | 'brush';
  name: string;
  visible: boolean;
  opacity: number; // 0 to 100
  x: number; // percentage 0 to 100
  y: number; // percentage 0 to 100
  scale: number;
  rotation: number;
  // Text / sticker payload
  content?: string;
  color?: string;
  bgColor?: string;
  fontSize?: number;
  fontFamily?: string;
  // Brush points
  points?: Array<{ x: number; y: number }>;
  strokeWidth?: number;
}

export interface PhotoProject {
  id: string;
  name: string;
  type: 'photo';
  updatedAt: string;
  createdAt: string;
  aspectRatio: AspectRatio | 'free';
  sourceDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  rotation: number;
  straightenAngle: number; // -15 to 15 degrees
  flipH: boolean;
  flipV: boolean;
  canvasBgColor: string;
  borderWidth: number;
  borderColor: string;
  adjustments: PhotoAdjustments;
  layers: PhotoLayer[];
}

export type AnyProject = VideoProject | PhotoProject;

export interface SharedMediaAsset {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  mimeType: string;
  sizeBytes: number;
  duration?: number;
  width?: number;
  height?: number;
  dataUrl: string;
  folder: 'All' | 'Camera' | 'Audio' | 'AI Generated' | 'Templates';
  createdAt: string;
}
