/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Film,
  Image as ImageIcon,
  FolderOpen,
  Sparkles,
  Smartphone,
  Shield,
  Plus,
  Trash2,
  Copy,
  Globe,
  Play,
  Home,
} from 'lucide-react';
import {
  Language,
  AnyProject,
  VideoProject,
  PhotoProject,
  SharedMediaAsset,
} from './types/studio';
import { t } from './i18n/translations';
import {
  listProjectsFromDB,
  saveProjectToDB,
  deleteProjectFromDB,
  listMediaAssetsFromDB,
  createStarterVideoProject,
  createStarterPhotoProject,
} from './services/storageService';
import { PublicAdConfig, AdBannerSlot } from './components/AdPlacements';
import { VideoEditorWorkspace } from './components/VideoEditorWorkspace';
import { PhotoEditorWorkspace } from './components/PhotoEditorWorkspace';
import { AiCreativeAssistant } from './components/AiCreativeAssistant';
import { AdminPanelConsole } from './components/AdminPanelConsole';
import { SharedMediaLibraryView, AndroidBuildAndDocsView } from './components/LibraryAndDocs';

type ActiveSection = 'dashboard' | 'video' | 'photo' | 'library' | 'ai' | 'apk' | 'admin';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [activeSection, setActiveSection] = useState<ActiveSection>(() => {
    if (window.location.pathname.startsWith('/admin')) {
      return 'admin';
    }
    return 'dashboard';
  });

  const [projects, setProjects] = useState<AnyProject[]>([]);
  const [mediaAssets, setMediaAssets] = useState<SharedMediaAsset[]>([]);
  const [currentVideoProject, setCurrentVideoProject] = useState<VideoProject>(() =>
    createStarterVideoProject()
  );
  const [currentPhotoProject, setCurrentPhotoProject] = useState<PhotoProject>(() =>
    createStarterPhotoProject()
  );

  // Server-provided public feature flags & AdMob configuration
  const [adConfig, setAdConfig] = useState<PublicAdConfig | null>(null);
  const [featureFlags, setFeatureFlags] = useState<{
    videoEditorEnabled: boolean;
    photoEditorEnabled: boolean;
    aiAssistantEnabled: boolean;
    aiPhotoToolsEnabled: boolean;
    maxExportResolution: '480p' | '720p' | '1080p';
    maintenanceMode: boolean;
    maintenanceNotice: string;
  }>({
    videoEditorEnabled: true,
    photoEditorEnabled: true,
    aiAssistantEnabled: true,
    aiPhotoToolsEnabled: true,
    maxExportResolution: '1080p',
    maintenanceMode: false,
    maintenanceNotice: '',
  });

  const refreshPublicConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config/public');
      if (res.ok) {
        const data = await res.json();
        if (data.ads) setAdConfig(data.ads);
        if (data.features) setFeatureFlags(data.features);
      }
    } catch {
      // Offline fallback works seamlessly for local editing
    }
  }, []);

  const refreshStoredData = useCallback(async () => {
    try {
      const savedProjs = await listProjectsFromDB();
      if (savedProjs.length === 0) {
        const starterVid = createStarterVideoProject();
        const starterPho = createStarterPhotoProject();
        await saveProjectToDB(starterVid);
        await saveProjectToDB(starterPho);
        setProjects([starterVid, starterPho]);
        setCurrentVideoProject(starterVid);
        setCurrentPhotoProject(starterPho);
      } else {
        setProjects(savedProjs);
        const firstVid = savedProjs.find((p): p is VideoProject => p.type === 'video');
        const firstPho = savedProjs.find((p): p is PhotoProject => p.type === 'photo');
        if (firstVid) setCurrentVideoProject(firstVid);
        if (firstPho) setCurrentPhotoProject(firstPho);
      }
      const assets = await listMediaAssetsFromDB();
      setMediaAssets(assets);
    } catch {
      // Ignore if IndexedDB restricted
    }
  }, []);

  useEffect(() => {
    refreshPublicConfig();
    refreshStoredData();
  }, [refreshPublicConfig, refreshStoredData]);

  // Navigate & sync URL path for /admin
  const navigateTo = (section: ActiveSection) => {
    setActiveSection(section);
    if (section === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else if (window.location.pathname === '/admin') {
      window.history.pushState({}, '', '/');
    }
  };

  const handleCreateNewVideoProject = async () => {
    const newVid = createStarterVideoProject();
    newVid.name = `Video Project #${projects.filter((p) => p.type === 'video').length + 1}`;
    await saveProjectToDB(newVid);
    await refreshStoredData();
    setCurrentVideoProject(newVid);
    navigateTo('video');
    fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'project_created' }),
    }).catch(() => {});
  };

  const handleCreateNewPhotoProject = async () => {
    const newPho = createStarterPhotoProject();
    newPho.name = `Photo Edit #${projects.filter((p) => p.type === 'photo').length + 1}`;
    await saveProjectToDB(newPho);
    await refreshStoredData();
    setCurrentPhotoProject(newPho);
    navigateTo('photo');
    fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'project_created' }),
    }).catch(() => {});
  };

  const handleDuplicateSavedProject = async (proj: AnyProject) => {
    const copy: AnyProject = {
      ...proj,
      id: `${proj.type}_proj_${Date.now()}`,
      name: `${proj.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveProjectToDB(copy);
    await refreshStoredData();
  };

  const handleDeleteSavedProject = async (id: string) => {
    await deleteProjectFromDB(id);
    await refreshStoredData();
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col pb-16 md:pb-0">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5 bg-[#0B0F17]/95 backdrop-blur-md border-b border-slate-800/90">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          Root Cart
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('dashboard');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'dashboard' ? 'text-amber-400 underline underline-offset-8' : ''
            }`}
          >
            {t(lang, 'navDashboard')}
          </a>
          <a
            href="#video"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('video');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'video' ? 'text-amber-400 underline underline-offset-8' : ''
            }`}
          >
            {t(lang, 'navVideoEditor')}
          </a>
          <a
            href="#photo"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('photo');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'photo' ? 'text-amber-400 underline underline-offset-8' : ''
            }`}
          >
            {t(lang, 'navPhotoEditor')}
          </a>
          <a
            href="#library"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('library');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'library' ? 'text-amber-400 underline underline-offset-8' : ''
            }`}
          >
            {t(lang, 'navMediaLibrary')}
          </a>
          <a
            href="#ai"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('ai');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'ai' ? 'text-amber-400 underline underline-offset-8' : ''
            }`}
          >
            {t(lang, 'navAiStudio')}
          </a>
        </nav>

        {/* Zone 3: 1 primary action (Language EN / বাংলা switch) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setLang((l) => (l === 'en' ? 'bn' : 'en'))}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {t(lang, 'languageToggle')}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
        {activeSection === 'dashboard' && (
          <div className="space-y-8">
            {/* Hero Entry Split */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-6">
                <div className="space-y-3">
                  <div className="text-xs text-amber-400 font-medium">
                    Android Package ID: com.rootcart.app · {t(lang, 'offlineReadyBadge')}
                  </div>
                  <h1
                    className="text-2xl sm:text-4xl font-bold text-white font-display tracking-tight"
                    style={{ textWrap: 'balance' }}
                  >
                    {t(lang, 'tagline')}
                  </h1>
                  <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                    Multi-track video timeline editing with real WebM/VP9 canvas rendering, non-destructive layer photo studio, optional server-protected Gemini AI creative tools, AdMob monetization, and a role-secured Admin Console.
                  </p>
                </div>

                {/* Primary First-Class Entry Points: Video Editor & Photo Editor */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={handleCreateNewVideoProject}
                    className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
                  >
                    <Film className="w-4 h-4" />
                    {t(lang, 'createNewVideo')}
                  </button>

                  <button
                    onClick={handleCreateNewPhotoProject}
                    className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-700 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
                  >
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    {t(lang, 'createNewPhoto')}
                  </button>

                  <button
                    onClick={() => navigateTo('apk')}
                    className="px-4 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 font-medium text-xs border border-slate-800 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
                  >
                    <Smartphone className="w-4 h-4 text-sky-400" />
                    {t(lang, 'navBuildApk')}
                  </button>

                  <button
                    onClick={() => navigateTo('admin')}
                    className="px-4 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 font-medium text-xs border border-slate-800 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 min-h-[44px]"
                  >
                    <Shield className="w-4 h-4 text-emerald-400" />
                    {t(lang, 'navAdmin')}
                  </button>
                </div>
              </div>

              {/* Quick Studio Workspace Preview Card */}
              <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h2 className="text-base font-bold text-white">
                    Active Workspace Capabilities
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Designed for touch ergonomics and 4 GB RAM Android devices with automatic IndexedDB recovery.
                  </p>
                </div>

                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span>Multi-Track Video & Audio Engine</span>
                    <span className="font-mono text-amber-400">480p / 720p / 1080p</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span>Non-Destructive Photo Studio</span>
                    <span className="font-mono text-sky-400">JPEG · PNG · WebP</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span>Bilingual Subtitles & SRT I/O</span>
                    <span className="font-mono text-emerald-400">English · বাংলা</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Saved Projects & Local Crash Recovery Library */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{t(lang, 'recentProjects')}</h2>
                <span className="text-xs text-slate-400 font-mono">
                  IndexedDB Local Storage ({projects.length} projects)
                </span>
              </div>

              {projects.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center text-xs text-slate-400">
                  {t(lang, 'noProjectsYet')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map((proj) => (
                    <div
                      key={proj.id}
                      className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-4 hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{proj.type === 'video' ? 'Video Project' : 'Photo Project'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{proj.aspectRatio}</span>
                          <span aria-hidden="true">·</span>
                          <span>{new Date(proj.updatedAt).toLocaleTimeString()}</span>
                        </div>
                        <h3 className="text-base font-bold text-white truncate">{proj.name}</h3>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
                        <button
                          onClick={() => {
                            if (proj.type === 'video') {
                              setCurrentVideoProject(proj);
                              navigateTo('video');
                            } else {
                              setCurrentPhotoProject(proj);
                              navigateTo('photo');
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Open in Studio
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDuplicateSavedProject(proj)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Duplicate Project"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSavedProject(proj.id)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-rose-400"
                            title="Delete Project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Non-Editing Home Screen AdMob Banner Placement */}
            <AdBannerSlot adConfig={adConfig} placementKey="bannerHome" lang={lang} />
          </div>
        )}

        {activeSection === 'video' && (
          <VideoEditorWorkspace
            project={currentVideoProject}
            onProjectChange={(updated) => {
              setCurrentVideoProject(updated);
              refreshStoredData();
            }}
            lang={lang}
            adConfig={adConfig}
            maxExportResolution={featureFlags.maxExportResolution}
            onSaveAssetToLibrary={() => refreshStoredData()}
          />
        )}

        {activeSection === 'photo' && (
          <PhotoEditorWorkspace
            project={currentPhotoProject}
            onProjectChange={(updated) => {
              setCurrentPhotoProject(updated);
              refreshStoredData();
            }}
            lang={lang}
            adConfig={adConfig}
            aiPhotoToolsEnabled={featureFlags.aiPhotoToolsEnabled}
            onSaveAssetToLibrary={() => refreshStoredData()}
          />
        )}

        {activeSection === 'library' && (
          <SharedMediaLibraryView
            assets={mediaAssets}
            onRefreshAssets={refreshStoredData}
            onApplyTemplateToVideo={() => navigateTo('video')}
            adConfig={adConfig}
            lang={lang}
          />
        )}

        {activeSection === 'ai' && (
          <AiCreativeAssistant
            lang={lang}
            adConfig={adConfig}
            aiEnabled={featureFlags.aiAssistantEnabled}
            onSaveAssetToLibrary={() => refreshStoredData()}
          />
        )}

        {activeSection === 'apk' && <AndroidBuildAndDocsView />}

        {activeSection === 'admin' && (
          <AdminPanelConsole onConfigUpdated={refreshPublicConfig} />
        )}
      </main>

      {/* Mobile Ergonomic Bottom Navigation Bar (< 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F17]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-5 items-center h-14">
        {(
          [
            { id: 'dashboard', label: t(lang, 'navDashboard'), icon: Home },
            { id: 'video', label: 'Video', icon: Film },
            { id: 'photo', label: 'Photo', icon: ImageIcon },
            { id: 'library', label: 'Library', icon: FolderOpen },
            { id: 'ai', label: 'AI', icon: Sparkles },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex flex-col items-center justify-center h-full ${
                active ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5 truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

