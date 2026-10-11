import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));

// Initialize server-side Gemini client with required User-Agent header
function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ============================================================================
// SERVER-SIDE STATE (Clearly labeled development persistence when no DB attached)
// ============================================================================

export interface ServerUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'creator' | 'pro_creator';
  status: 'active' | 'suspended';
  projectsCount: number;
  exportsCount: number;
  aiRequestsUsed: number;
  joinedAt: string;
  lastActive: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
  ip: string;
}

export interface SupportTicket {
  id: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface AdPlacementConfig {
  enabled: boolean;
  adUnitId: string;
  frequencyCapMinutes?: number;
  location: string;
}

export interface AdSystemConfig {
  provider: 'admob' | 'applovin_max_ready';
  androidAppId: string;
  testMode: boolean;
  globalAdsEnabled: boolean;
  placements: {
    bannerHome: AdPlacementConfig;
    bannerLibrary: AdPlacementConfig;
    nativeTemplates: AdPlacementConfig;
    interstitialPostExport: AdPlacementConfig;
    rewardedAiUnlock: AdPlacementConfig;
    appOpen: AdPlacementConfig;
  };
}

export interface FeatureSystemConfig {
  videoEditorEnabled: boolean;
  photoEditorEnabled: boolean;
  aiAssistantEnabled: boolean;
  aiPhotoToolsEnabled: boolean;
  dailyAiQuotaPerUser: number;
  maxExportResolution: '480p' | '720p' | '1080p';
  lowMemoryGuardDefault: boolean;
  maintenanceMode: boolean;
  maintenanceNotice: string;
}

// Official Google AdMob Test Identifiers for Android
const DEFAULT_AD_CONFIG: AdSystemConfig = {
  provider: 'admob',
  androidAppId: process.env.VITE_ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
  testMode: true,
  globalAdsEnabled: true,
  placements: {
    bannerHome: {
      enabled: true,
      adUnitId: process.env.VITE_ADMOB_BANNER_ID || 'ca-app-pub-3940256099942544/6300978111',
      location: 'Home Dashboard Footer (Non-Editing)',
    },
    bannerLibrary: {
      enabled: true,
      adUnitId: process.env.VITE_ADMOB_BANNER_ID || 'ca-app-pub-3940256099942544/6300978111',
      location: 'Project Library Bottom Slot (Non-Editing)',
    },
    nativeTemplates: {
      enabled: true,
      adUnitId: process.env.VITE_ADMOB_NATIVE_ID || 'ca-app-pub-3940256099942544/2247696110',
      location: 'Creative Template Discovery Feed',
    },
    interstitialPostExport: {
      enabled: true,
      adUnitId: process.env.VITE_ADMOB_INTERSTITIAL_ID || 'ca-app-pub-3940256099942544/1033173712',
      frequencyCapMinutes: 5,
      location: 'Natural Transition After Completed Export Only',
    },
    rewardedAiUnlock: {
      enabled: true,
      adUnitId: process.env.VITE_ADMOB_REWARDED_ID || 'ca-app-pub-3940256099942544/5224354917',
      location: 'Voluntary Bonus AI Quota / Template Unlock',
    },
    appOpen: {
      enabled: false, // Disabled by default per specification
      adUnitId: process.env.VITE_ADMOB_APP_OPEN_ID || 'ca-app-pub-3940256099942544/9257395921',
      location: 'Cold App Launch (Disabled by Default)',
    },
  },
};

const DEFAULT_FEATURE_CONFIG: FeatureSystemConfig = {
  videoEditorEnabled: true,
  photoEditorEnabled: true,
  aiAssistantEnabled: true,
  aiPhotoToolsEnabled: true,
  dailyAiQuotaPerUser: 25,
  maxExportResolution: '1080p',
  lowMemoryGuardDefault: true,
  maintenanceMode: false,
  maintenanceNotice: '',
};

let adConfig: AdSystemConfig = { ...DEFAULT_AD_CONFIG };
let featureConfig: FeatureSystemConfig = { ...DEFAULT_FEATURE_CONFIG };

let usersStore: ServerUser[] = [
  {
    id: 'usr_admin_01',
    name: 'Root Cart System Admin',
    email: process.env.ADMIN_EMAIL || 'admin@rootcart.app',
    role: 'admin',
    status: 'active',
    projectsCount: 4,
    exportsCount: 12,
    aiRequestsUsed: 8,
    joinedAt: '2026-09-01T10:00:00Z',
    lastActive: new Date().toISOString(),
  },
  {
    id: 'usr_creator_02',
    name: 'Tanvir Rahman',
    email: 'tanvir.dhaka@example.com',
    role: 'pro_creator',
    status: 'active',
    projectsCount: 9,
    exportsCount: 27,
    aiRequestsUsed: 14,
    joinedAt: '2026-09-14T08:30:00Z',
    lastActive: '2026-10-09T18:20:00Z',
  },
  {
    id: 'usr_creator_03',
    name: 'Nusrat Jahan',
    email: 'nusrat.creative@example.com',
    role: 'creator',
    status: 'active',
    projectsCount: 5,
    exportsCount: 11,
    aiRequestsUsed: 6,
    joinedAt: '2026-09-22T14:15:00Z',
    lastActive: '2026-10-09T20:05:00Z',
  },
  {
    id: 'usr_creator_04',
    name: 'Arif Hossain',
    email: 'arif.reels@example.com',
    role: 'creator',
    status: 'suspended',
    projectsCount: 2,
    exportsCount: 1,
    aiRequestsUsed: 25,
    joinedAt: '2026-10-01T11:10:00Z',
    lastActive: '2026-10-05T09:40:00Z',
  },
];

let supportTickets: SupportTicket[] = [
  {
    id: 'tkt_101',
    userEmail: 'tanvir.dhaka@example.com',
    subject: 'Bengali font rendering in 1080p WebM export',
    message: 'Verified that Hind Siliguri and Noto Sans Bengali render cleanly on Canvas overlay track.',
    status: 'resolved',
    createdAt: '2026-10-08T15:12:00Z',
  },
  {
    id: 'tkt_102',
    userEmail: 'nusrat.creative@example.com',
    subject: 'Request for 4:5 Instagram Portrait preset in Photo Editor',
    message: 'Could we keep 4:5 aspect ratio in the top crop bar for quick social exports?',
    status: 'open',
    createdAt: '2026-10-09T11:45:00Z',
  },
];

let auditLogs: AuditLogEntry[] = [
  {
    id: 'aud_01',
    timestamp: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
    actorEmail: 'system@rootcart.app',
    action: 'INIT_ADMOB_TEST_CONFIG',
    target: 'AdSystemConfig',
    details: 'Initialized Google AdMob official Android test ad unit IDs; App-Open disabled by default.',
    ip: '127.0.0.1',
  },
];

// Real runtime telemetry counters tracked during server session
const runtimeStats = {
  projectsCreated: 20,
  videoExportsCompleted: 38,
  photoExportsCompleted: 64,
  aiRequestsProcessed: 31,
  aiErrorsCount: 0,
  adImpressionsTestMode: 142,
  adRewardsGrantedTestMode: 19,
};

// ============================================================================
// SERVER-SIDE AUTHENTICATION & RATE LIMITING
// ============================================================================

const ADMIN_SESSIONS = new Map<string, { email: string; role: string; expiresAt: number }>();
const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function createAdminToken(email: string): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const secret = process.env.ADMIN_SESSION_SECRET || 'rootcart-production-hmac-secret-change-me';
  const hmac = crypto.createHmac('sha256', secret).update(`${email}:${randomBytes}`).digest('hex');
  const token = `${randomBytes}.${hmac}`;
  ADMIN_SESSIONS.set(token, {
    email,
    role: 'admin',
    expiresAt: Date.now() + 1000 * 60 * 60 * 8, // 8 hours
  });
  return token;
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing server-side Admin Bearer token.' });
    return;
  }
  const token = authHeader.slice(7);
  const session = ADMIN_SESSIONS.get(token);
  if (!session || session.expiresAt < Date.now() || session.role !== 'admin') {
    ADMIN_SESSIONS.delete(token);
    res.status(403).json({ error: 'Forbidden: Invalid or expired Admin session.' });
    return;
  }
  (req as any).adminUser = session;
  next();
}

function checkAiRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window
  const maxLimit = featureConfig.dailyAiQuotaPerUser;
  const record = aiRateLimitMap.get(ip);
  if (!record || record.resetAt < now) {
    aiRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxLimit - 1 };
  }
  if (record.count >= maxLimit) {
    return { allowed: false, remaining: 0 };
  }
  record.count += 1;
  return { allowed: true, remaining: maxLimit - record.count };
}

function recordAudit(actorEmail: string, action: string, target: string, details: string, ip: string) {
  auditLogs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    actorEmail,
    action,
    target,
    details,
    ip,
  });
  if (auditLogs.length > 200) auditLogs.pop();
}

// ============================================================================
// PUBLIC CONFIG & TELEMETRY ENDPOINTS
// ============================================================================

app.get('/api/config/public', (_req: Request, res: Response) => {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({
    features: featureConfig,
    ads: adConfig,
    services: {
      geminiConfigured: hasGeminiKey,
      environmentMode: 'development_seeded',
      serverTimestamp: new Date().toISOString(),
    },
  });
});

app.post('/api/telemetry/event', (req: Request, res: Response) => {
  const { type } = req.body || {};
  if (type === 'project_created') runtimeStats.projectsCreated += 1;
  if (type === 'video_export') runtimeStats.videoExportsCompleted += 1;
  if (type === 'photo_export') runtimeStats.photoExportsCompleted += 1;
  if (type === 'ad_impression') runtimeStats.adImpressionsTestMode += 1;
  if (type === 'ad_reward') {
    runtimeStats.adRewardsGrantedTestMode += 1;
    // Also grant +3 bonus AI requests to the caller IP
    const ip = req.ip || '127.0.0.1';
    const record = aiRateLimitMap.get(ip);
    if (record) {
      record.count = Math.max(0, record.count - 3);
    }
  }
  res.json({ ok: true });
});

// ============================================================================
// ADMIN AUTHENTICATION & PROTECTED ADMIN APIs
// ============================================================================

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const expectedEmail = process.env.ADMIN_EMAIL || 'admin@rootcart.app';
  const expectedPassword = process.env.ADMIN_PASSWORD || 'RootCartSecureAdmin2026!';

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  if (email.trim().toLowerCase() === expectedEmail.toLowerCase() && password === expectedPassword) {
    const token = createAdminToken(expectedEmail);
    recordAudit(expectedEmail, 'ADMIN_LOGIN_SUCCESS', 'AdminSession', 'Authenticated via server-side credential verification.', req.ip || '127.0.0.1');
    res.json({
      token,
      admin: {
        email: expectedEmail,
        role: 'admin',
      },
    });
  } else {
    recordAudit(String(email), 'ADMIN_LOGIN_FAILED', 'AdminSession', 'Invalid credentials supplied.', req.ip || '127.0.0.1');
    res.status(401).json({
      error: 'Invalid administrator credentials. For development testing, see default credentials in .env.example (admin@rootcart.app / RootCartSecureAdmin2026!).',
    });
  }
});

app.post('/api/admin/logout', requireAdminAuth, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.slice(7);
  const adminUser = (req as any).adminUser;
  ADMIN_SESSIONS.delete(token);
  recordAudit(adminUser.email, 'ADMIN_LOGOUT', 'AdminSession', 'Terminated admin session.', req.ip || '127.0.0.1');
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdminAuth, (_req: Request, res: Response) => {
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
  res.json({
    isDevelopmentSeededData: true,
    metrics: {
      registeredUsers: usersStore.length,
      activeUsers: usersStore.filter((u) => u.status === 'active').length,
      suspendedUsers: usersStore.filter((u) => u.status === 'suspended').length,
      projectsCreated: runtimeStats.projectsCreated,
      videoExports: runtimeStats.videoExportsCompleted,
      photoExports: runtimeStats.photoExportsCompleted,
      aiRequestsProcessed: runtimeStats.aiRequestsProcessed,
      aiErrorsCount: runtimeStats.aiErrorsCount,
      adImpressionsTestMode: runtimeStats.adImpressionsTestMode,
      adRewardsGrantedTestMode: runtimeStats.adRewardsGrantedTestMode,
    },
    serviceStatus: {
      geminiApi: hasGeminiKey ? 'operational' : 'missing_api_key',
      adMobMode: adConfig.testMode ? 'official_google_test_ids' : 'production_configured',
      storageEngine: 'in_memory_dev_seed_plus_client_indexeddb',
    },
    users: usersStore,
    features: featureConfig,
    ads: adConfig,
    supportTickets,
    auditLogs,
  });
});

app.patch('/api/admin/users/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, role } = req.body || {};
  const adminUser = (req as any).adminUser;

  const user = usersStore.find((u) => u.id === id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (status && (status === 'active' || status === 'suspended')) {
    user.status = status;
  }
  if (role && (role === 'admin' || role === 'creator' || role === 'pro_creator')) {
    user.role = role;
  }

  recordAudit(
    adminUser.email,
    'USER_ACCOUNT_UPDATED',
    user.email,
    `Updated status=${user.status}, role=${user.role}`,
    req.ip || '127.0.0.1'
  );

  res.json({ user, auditLogs });
});

app.put('/api/admin/features', requireAdminAuth, (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const updates = req.body || {};

  featureConfig = {
    ...featureConfig,
    videoEditorEnabled: typeof updates.videoEditorEnabled === 'boolean' ? updates.videoEditorEnabled : featureConfig.videoEditorEnabled,
    photoEditorEnabled: typeof updates.photoEditorEnabled === 'boolean' ? updates.photoEditorEnabled : featureConfig.photoEditorEnabled,
    aiAssistantEnabled: typeof updates.aiAssistantEnabled === 'boolean' ? updates.aiAssistantEnabled : featureConfig.aiAssistantEnabled,
    aiPhotoToolsEnabled: typeof updates.aiPhotoToolsEnabled === 'boolean' ? updates.aiPhotoToolsEnabled : featureConfig.aiPhotoToolsEnabled,
    dailyAiQuotaPerUser: typeof updates.dailyAiQuotaPerUser === 'number' ? Math.max(1, Math.min(500, updates.dailyAiQuotaPerUser)) : featureConfig.dailyAiQuotaPerUser,
    maxExportResolution: ['480p', '720p', '1080p'].includes(updates.maxExportResolution) ? updates.maxExportResolution : featureConfig.maxExportResolution,
    lowMemoryGuardDefault: typeof updates.lowMemoryGuardDefault === 'boolean' ? updates.lowMemoryGuardDefault : featureConfig.lowMemoryGuardDefault,
    maintenanceMode: typeof updates.maintenanceMode === 'boolean' ? updates.maintenanceMode : featureConfig.maintenanceMode,
    maintenanceNotice: typeof updates.maintenanceNotice === 'string' ? updates.maintenanceNotice.slice(0, 300) : featureConfig.maintenanceNotice,
  };

  recordAudit(
    adminUser.email,
    'FEATURE_FLAGS_UPDATED',
    'FeatureSystemConfig',
    `AI=${featureConfig.aiAssistantEnabled}, Quota=${featureConfig.dailyAiQuotaPerUser}, MaxRes=${featureConfig.maxExportResolution}`,
    req.ip || '127.0.0.1'
  );

  res.json({ features: featureConfig, auditLogs });
});

app.put('/api/admin/ads', requireAdminAuth, (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const updates = req.body || {};

  adConfig = {
    ...adConfig,
    provider: updates.provider === 'applovin_max_ready' ? 'applovin_max_ready' : 'admob',
    androidAppId: typeof updates.androidAppId === 'string' && updates.androidAppId.trim() ? updates.androidAppId.trim() : adConfig.androidAppId,
    testMode: typeof updates.testMode === 'boolean' ? updates.testMode : adConfig.testMode,
    globalAdsEnabled: typeof updates.globalAdsEnabled === 'boolean' ? updates.globalAdsEnabled : adConfig.globalAdsEnabled,
    placements: updates.placements ? { ...adConfig.placements, ...updates.placements } : adConfig.placements,
  };

  recordAudit(
    adminUser.email,
    'AD_CONFIG_UPDATED',
    'AdSystemConfig',
    `GlobalAds=${adConfig.globalAdsEnabled}, TestMode=${adConfig.testMode}, Provider=${adConfig.provider}`,
    req.ip || '127.0.0.1'
  );

  res.json({ ads: adConfig, auditLogs });
});

app.patch('/api/admin/tickets/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const adminUser = (req as any).adminUser;
  const ticket = supportTickets.find((t) => t.id === id);
  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found.' });
    return;
  }
  if (status === 'open' || status === 'resolved') {
    ticket.status = status;
  }
  recordAudit(adminUser.email, 'SUPPORT_TICKET_UPDATED', ticket.id, `Status set to ${ticket.status}`, req.ip || '127.0.0.1');
  res.json({ supportTickets, auditLogs });
});

// ============================================================================
// PROTECTED GEMINI AI ROUTES (Server-Side Only)
// ============================================================================

// 1. Creative Assistant (Scripts, Shot Lists, Subtitle Translation EN<->BN, Social Captions, Cut Suggestions)
app.post('/api/ai/creative', async (req: Request, res: Response) => {
  if (!featureConfig.aiAssistantEnabled) {
    res.status(403).json({ error: 'AI Creative Assistant is currently disabled by the system administrator.' });
    return;
  }

  const rateCheck = checkAiRateLimit(req.ip || '127.0.0.1');
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Hourly AI quota (${featureConfig.dailyAiQuotaPerUser} requests) reached. Watch an optional Rewarded Ad or wait for reset.`,
    });
    return;
  }

  const ai = getGenAIClient();
  if (!ai) {
    res.status(503).json({
      error: 'Gemini API key is not configured on the server. Ensure GEMINI_API_KEY is set in the environment.',
    });
    return;
  }

  const { taskType, prompt, targetLanguage } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'A valid prompt is required.' });
    return;
  }

  let systemInstruction =
    'You are Root Cart AI Creative Studio Assistant for professional video and photo creators. Respond clearly, practically, and concisely. Support both English and Bengali (বাংলা) fluently.';

  if (taskType === 'script') {
    systemInstruction +=
      ' Generate a structured short-form or long-form video script with [Timecode], [Visual Shot], and [Spoken Audio/Dialogue] columns.';
  } else if (taskType === 'subtitles_translate') {
    systemInstruction += ` Translate and time-align the provided captions into ${targetLanguage === 'bn' ? 'Bengali (বাংলা)' : 'English'}, preserving natural spoken rhythm and SRT-friendly phrasing.`;
  } else if (taskType === 'social_pack') {
    systemInstruction +=
      ' Generate 3 high-converting video titles, an SEO description, and 12 targeted hashtags in both English and Bengali.';
  } else if (taskType === 'smart_cuts') {
    systemInstruction +=
      ' Analyze the creator project description or transcript and suggest exact pacing cuts, hook improvements, and B-roll overlay placements.';
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
      },
    });

    runtimeStats.aiRequestsProcessed += 1;
    res.json({
      result: response.text || '',
      remainingQuota: rateCheck.remaining,
    });
  } catch (err: any) {
    runtimeStats.aiErrorsCount += 1;
    res.status(500).json({
      error: err?.message || 'Failed to generate AI creative response.',
    });
  }
});

// 2. AI Photo Inspection & Smart Grading Suggestions (Analyzes real uploaded image via multimodal Gemini 3.8 Flash)
app.post('/api/ai/photo-analyze', async (req: Request, res: Response) => {
  if (!featureConfig.aiPhotoToolsEnabled) {
    res.status(403).json({ error: 'AI Photo Tools are currently disabled by the administrator.' });
    return;
  }

  const rateCheck = checkAiRateLimit(req.ip || '127.0.0.1');
  if (!rateCheck.allowed) {
    res.status(429).json({ error: 'AI quota reached. Watch a Rewarded Ad to unlock +3 AI operations.' });
    return;
  }

  const ai = getGenAIClient();
  if (!ai) {
    res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  const { imageBase64, mimeType, instruction } = req.body || {};
  if (!imageBase64 || !mimeType) {
    res.status(400).json({ error: 'Image data and mimeType are required.' });
    return;
  }

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text:
              instruction ||
              'Analyze this photo for lighting, exposure, color cast, and subject framing. Return exact numeric adjustment recommendations for Root Cart Photo Editor sliders.',
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            critiqueSummary: { type: Type.STRING, description: 'Concise professional photography assessment.' },
            subjectDetected: { type: Type.STRING, description: 'Main subject detected in frame.' },
            recommendedAdjustments: {
              type: Type.OBJECT,
              properties: {
                brightness: { type: Type.NUMBER, description: 'Value from -50 to 50' },
                contrast: { type: Type.NUMBER, description: 'Value from -50 to 50' },
                exposure: { type: Type.NUMBER, description: 'Value from -50 to 50' },
                saturation: { type: Type.NUMBER, description: 'Value from -50 to 50' },
                temperature: { type: Type.NUMBER, description: 'Value from -50 to 50' },
                tint: { type: Type.NUMBER, description: 'Value from -50 to 50' },
                sharpness: { type: Type.NUMBER, description: 'Value from 0 to 60' },
                vignette: { type: Type.NUMBER, description: 'Value from 0 to 60' },
              },
              required: ['brightness', 'contrast', 'exposure', 'saturation', 'temperature', 'tint', 'sharpness', 'vignette'],
            },
          },
          required: ['critiqueSummary', 'subjectDetected', 'recommendedAdjustments'],
        },
      },
    });

    runtimeStats.aiRequestsProcessed += 1;
    const parsed = JSON.parse((response.text || '{}').trim());
    res.json({
      analysis: parsed,
      remainingQuota: rateCheck.remaining,
    });
  } catch (err: any) {
    runtimeStats.aiErrorsCount += 1;
    res.status(500).json({ error: err?.message || 'Failed to analyze photo with Gemini.' });
  }
});

// 3. AI Audio Transcription for Automatic Subtitles (Gemini 3.5 Transcribe)
app.post('/api/ai/transcribe', async (req: Request, res: Response) => {
  if (!featureConfig.aiAssistantEnabled) {
    res.status(403).json({ error: 'AI Transcription is disabled by administrator.' });
    return;
  }

  const rateCheck = checkAiRateLimit(req.ip || '127.0.0.1');
  if (!rateCheck.allowed) {
    res.status(429).json({ error: 'AI quota reached.' });
    return;
  }

  const ai = getGenAIClient();
  if (!ai) {
    res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  const { audioBase64, mimeType, languageHint } = req.body || {};
  if (!audioBase64 || !mimeType) {
    res.status(400).json({ error: 'audioBase64 and mimeType are required for transcription.' });
    return;
  }

  try {
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Transcribe this audio accurately${languageHint ? ` in ${languageHint}` : ''}. Break it into short subtitle phrases (max 8 words per line).`,
          },
        ],
      },
    });

    runtimeStats.aiRequestsProcessed += 1;
    res.json({
      transcript: response.text || '',
      remainingQuota: rateCheck.remaining,
    });
  } catch (err: any) {
    runtimeStats.aiErrorsCount += 1;
    res.status(500).json({ error: err?.message || 'Audio transcription failed.' });
  }
});

// 4. AI Voiceover Generation (Gemini 3.8 Flash Lite TTS -> returns complete 24kHz WAV)
app.post('/api/ai/tts', async (req: Request, res: Response) => {
  if (!featureConfig.aiAssistantEnabled) {
    res.status(403).json({ error: 'AI Voiceover is disabled by administrator.' });
    return;
  }

  const rateCheck = checkAiRateLimit(req.ip || '127.0.0.1');
  if (!rateCheck.allowed) {
    res.status(429).json({ error: 'AI quota reached.' });
    return;
  }

  const ai = getGenAIClient();
  if (!ai) {
    res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    return;
  }

  const { text, voiceName, stylePrompt } = req.body || {};
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Voiceover script text is required.' });
    return;
  }

  const selectedVoice = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(voiceName) ? voiceName : 'Kore';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 800),
              speechMetadata: {
                style: stylePrompt || 'Clear, engaging creator voiceover',
              },
            } as any,
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: selectedVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      res.status(500).json({ error: 'Model did not return audio data.' });
      return;
    }

    runtimeStats.aiRequestsProcessed += 1;
    res.json({
      audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
      remainingQuota: rateCheck.remaining,
    });
  } catch (err: any) {
    runtimeStats.aiErrorsCount += 1;
    res.status(500).json({ error: err?.message || 'Voiceover generation failed.' });
  }
});

// ============================================================================
// VITE MIDDLEWARE & STATIC FALLBACK
// ============================================================================

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Root Cart Full-Stack Studio Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
