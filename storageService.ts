import { AnyProject, SharedMediaAsset, VideoProject, PhotoProject } from '../types/studio';

const DB_NAME = 'RootCartStudioDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_MEDIA = 'media_assets';

function openStudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProjectToDB(project: AnyProject): Promise<void> {
  const db = await openStudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    project.updatedAt = new Date().toISOString();
    tx.objectStore(STORE_PROJECTS).put(project);
    tx.oncomplete = () => {
      localStorage.setItem('rootcart_last_autosave_id', project.id);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function listProjectsFromDB(): Promise<AnyProject[]> {
  const db = await openStudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).getAll();
    req.onsuccess = () => {
      const list = (req.result as AnyProject[]) || [];
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectFromDB(id: string): Promise<void> {
  const db = await openStudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveMediaAssetToDB(asset: SharedMediaAsset): Promise<void> {
  const db = await openStudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listMediaAssetsFromDB(): Promise<SharedMediaAsset[]> {
  const db = await openStudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const req = tx.objectStore(STORE_MEDIA).getAll();
    req.onsuccess = () => {
      const list = (req.result as SharedMediaAsset[]) || [];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMediaAssetFromDB(id: string): Promise<void> {
  const db = await openStudioDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Create a rich default starter Video Project so users can immediately press Play & edit on first load
export function createStarterVideoProject(): VideoProject {
  const now = new Date().toISOString();
  return {
    id: `vid_proj_${Date.now()}`,
    name: 'Dhaka Street Documentary Reel',
    type: 'video',
    createdAt: now,
    updatedAt: now,
    aspectRatio: '16:9',
    canvasBgColor: '#090D16',
    lowMemoryProxyMode: true,
    tracks: [
      { id: 'trk_video', name: 'V1 · Main Video', type: 'video', muted: false, locked: false, hidden: false },
      { id: 'trk_overlay', name: 'V2 · PIP & Overlays', type: 'overlay', muted: false, locked: false, hidden: false },
      { id: 'trk_text', name: 'T1 · Titles', type: 'text', muted: false, locked: false, hidden: false },
      { id: 'trk_sub', name: 'S1 · Subtitles (EN/BN)', type: 'subtitle', muted: false, locked: false, hidden: false },
      { id: 'trk_audio', name: 'A1 · Music & Voiceover', type: 'audio', muted: false, locked: false, hidden: false },
    ],
    clips: [
      {
        id: 'clp_scene_1',
        trackId: 'trk_video',
        type: 'video',
        name: '01. Golden Hour Horizon (Procedural Canvas Scene)',
        startTime: 0,
        duration: 4,
        trimStart: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        x: 0,
        y: 0,
        speed: 1,
        volume: 85,
        fadeIn: 0.5,
        fadeOut: 0.5,
        transition: 'fade',
        adjustments: {
          brightness: 5,
          contrast: 12,
          saturation: 15,
          exposure: 0,
          temperature: 10,
          tint: 0,
          opacity: 100,
          chromaKeyEnabled: false,
          chromaKeyColor: '#00ff00',
          chromaKeyThreshold: 40,
        },
      },
      {
        id: 'clp_scene_2',
        trackId: 'trk_video',
        type: 'video',
        name: '02. Neon Monsoon Motion (Procedural Canvas Scene)',
        startTime: 4,
        duration: 4,
        trimStart: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        x: 0,
        y: 0,
        speed: 1,
        volume: 85,
        fadeIn: 0.3,
        fadeOut: 0.8,
        transition: 'slideLeft',
        adjustments: {
          brightness: 0,
          contrast: 18,
          saturation: 20,
          exposure: 5,
          temperature: -8,
          tint: 5,
          opacity: 100,
          chromaKeyEnabled: false,
          chromaKeyColor: '#00ff00',
          chromaKeyThreshold: 40,
        },
      },
      {
        id: 'clp_title_1',
        trackId: 'trk_text',
        type: 'text',
        name: 'Main Title Card',
        startTime: 0.4,
        duration: 3.2,
        trimStart: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        x: 0,
        y: -22,
        speed: 1,
        volume: 0,
        fadeIn: 0.3,
        fadeOut: 0.3,
        transition: 'fade',
        textContent: 'ROOT CART STUDIO',
        fontFamily: 'Outfit',
        fontSize: 44,
        textColor: '#F59E0B',
        textBgColor: '#0F172ACC',
        textOutline: true,
        textAlign: 'center',
        animationPreset: 'pop',
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
      },
      {
        id: 'clp_sub_1',
        trackId: 'trk_sub',
        type: 'subtitle',
        name: 'Bengali & English Subtitle 1',
        startTime: 0.5,
        duration: 3.3,
        trimStart: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        x: 0,
        y: 35,
        speed: 1,
        volume: 0,
        fadeIn: 0.2,
        fadeOut: 0.2,
        transition: 'none',
        textContent: 'রুট কার্ট ভিডিও এডিটরে স্বাগতম · Welcome to Root Cart',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 24,
        textColor: '#FFFFFF',
        textBgColor: '#000000B3',
        textOutline: true,
        textAlign: 'center',
        animationPreset: 'slideUp',
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
      },
      {
        id: 'clp_sub_2',
        trackId: 'trk_sub',
        type: 'subtitle',
        name: 'Subtitle 2',
        startTime: 4.2,
        duration: 3.5,
        trimStart: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        x: 0,
        y: 35,
        speed: 1,
        volume: 0,
        fadeIn: 0.2,
        fadeOut: 0.2,
        transition: 'none',
        textContent: 'Multi-track timeline, Chroma Key & real WebM export',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 24,
        textColor: '#38BDF8',
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
      },
      {
        id: 'clp_audio_synth',
        trackId: 'trk_audio',
        type: 'audio',
        name: 'Ambient Studio Pulse (Synthesized Audio Track)',
        startTime: 0,
        duration: 8,
        trimStart: 0,
        scale: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        x: 0,
        y: 0,
        speed: 1,
        volume: 70,
        fadeIn: 0.5,
        fadeOut: 1.0,
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
      },
    ],
  };
}

// Generate a rich SVG data URL sample portrait/landscape photo for immediate Photo Editor testing
export function createSamplePhotoDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="45%" stop-color="#1e293b"/>
        <stop offset="75%" stop-color="#b45309"/>
        <stop offset="100%" stop-color="#f59e0b"/>
      </linearGradient>
      <radialGradient id="sun" cx="0.72" cy="0.38" r="0.28">
        <stop offset="0%" stop-color="#fef3c7"/>
        <stop offset="45%" stop-color="#f59e0b" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="900" fill="url(#sky)"/>
    <circle cx="860" cy="340" r="240" fill="url(#sun)"/>
    <path d="M0 640 L260 450 L490 590 L780 390 L1040 560 L1200 470 L1200 900 L0 900 Z" fill="#1e293b"/>
    <path d="M0 710 L340 540 L630 680 L920 510 L1200 660 L1200 900 L0 900 Z" fill="#0f172a"/>
    <rect x="0" y="770" width="1200" height="130" fill="#090d16"/>
    <circle cx="330" cy="300" r="48" fill="#38bdf8" fill-opacity="0.25"/>
    <text x="70" y="845" fill="#94a3b8" font-family="sans-serif" font-size="26" font-weight="bold">ROOT CART · RAW COLOR CALIBRATION PLATE 1200×900</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createStarterPhotoProject(): PhotoProject {
  const now = new Date().toISOString();
  return {
    id: `pho_proj_${Date.now()}`,
    name: 'Golden Sundarbans Calibration Frame',
    type: 'photo',
    createdAt: now,
    updatedAt: now,
    aspectRatio: 'free',
    sourceDataUrl: createSamplePhotoDataUrl(),
    originalWidth: 1200,
    originalHeight: 900,
    rotation: 0,
    straightenAngle: 0,
    flipH: false,
    flipV: false,
    canvasBgColor: '#0B0F17',
    borderWidth: 0,
    borderColor: '#FFFFFF',
    adjustments: {
      brightness: 0,
      contrast: 8,
      exposure: 0,
      highlights: 0,
      shadows: 0,
      saturation: 10,
      temperature: 6,
      tint: 0,
      sharpness: 15,
      blur: 0,
      vignette: 12,
      bw: false,
      filterPreset: 'none',
      filterIntensity: 100,
    },
    layers: [
      {
        id: 'lyr_1',
        type: 'text',
        name: 'Magazine Header Layer',
        visible: true,
        opacity: 95,
        x: 50,
        y: 16,
        scale: 1,
        rotation: 0,
        content: 'BENGAL HORIZON · 2026',
        color: '#FEF3C7',
        bgColor: 'transparent',
        fontSize: 42,
        fontFamily: 'Outfit',
      },
    ],
  };
}
