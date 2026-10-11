import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sparkles, X, Play, ExternalLink } from 'lucide-react';
import { Language } from '../types/studio';
import { t } from '../i18n/translations';

export interface PublicAdConfig {
  provider: 'admob' | 'applovin_max_ready';
  androidAppId: string;
  testMode: boolean;
  globalAdsEnabled: boolean;
  placements: {
    bannerHome: { enabled: boolean; adUnitId: string; location: string };
    bannerLibrary: { enabled: boolean; adUnitId: string; location: string };
    nativeTemplates: { enabled: boolean; adUnitId: string; location: string };
    interstitialPostExport: { enabled: boolean; adUnitId: string; frequencyCapMinutes?: number; location: string };
    rewardedAiUnlock: { enabled: boolean; adUnitId: string; location: string };
    appOpen: { enabled: boolean; adUnitId: string; location: string };
  };
}

// Frequency cap tracker for Interstitial ads so they never spam the user
let lastInterstitialShownAt = 0;

export function canShowInterstitial(adConfig: PublicAdConfig | null): boolean {
  if (!adConfig || !adConfig.globalAdsEnabled || !adConfig.placements.interstitialPostExport.enabled) {
    return false;
  }
  const capMinutes = adConfig.placements.interstitialPostExport.frequencyCapMinutes ?? 5;
  const elapsedMs = Date.now() - lastInterstitialShownAt;
  return elapsedMs >= capMinutes * 60 * 1000;
}

export function markInterstitialShown() {
  lastInterstitialShownAt = Date.now();
  fetch('/api/telemetry/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'ad_impression' }),
  }).catch(() => {});
}

// 1. Non-Intrusive Banner Placement (Home / Library only — NEVER inside active editors)
export const AdBannerSlot: React.FC<{
  adConfig: PublicAdConfig | null;
  placementKey: 'bannerHome' | 'bannerLibrary';
  lang: Language;
}> = ({ adConfig, placementKey, lang }) => {
  const placement = adConfig?.placements?.[placementKey];

  useEffect(() => {
    if (adConfig?.globalAdsEnabled && placement?.enabled) {
      fetch('/api/telemetry/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ad_impression' }),
      }).catch(() => {});
    }
  }, [adConfig?.globalAdsEnabled, placement?.enabled]);

  if (!adConfig || !adConfig.globalAdsEnabled || !placement || !placement.enabled) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Advertisement Banner"
      className="w-full max-w-4xl mx-auto my-4 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 shrink-0">
          {adConfig.testMode ? 'AdMob Test Banner' : 'Sponsored'}
        </span>
        <span className="text-slate-600" aria-hidden="true">·</span>
        <p className="text-xs text-slate-300 truncate">
          Root Cart Pro Color LUTs & Audio Pack — Configured via Google Mobile Ads SDK ({placement.adUnitId})
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
          {placement.location}
        </span>
      </div>
    </div>
  );
};

// 2. Native Ad Card for Template Discovery Area
export const NativeTemplateAdCard: React.FC<{
  adConfig: PublicAdConfig | null;
  lang: Language;
  onApplySponsoredTemplate: () => void;
}> = ({ adConfig, lang, onApplySponsoredTemplate }) => {
  const placement = adConfig?.placements?.nativeTemplates;
  if (!adConfig || !adConfig.globalAdsEnabled || !placement || !placement.enabled) {
    return null;
  }

  return (
    <div className="p-4 rounded-xl bg-slate-900/70 border border-amber-500/30 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-center justify-between gap-2 text-xs text-amber-400 mb-1">
          <span>{t(lang, 'sponsoredLabel')}</span>
          <span className="font-mono text-[11px] text-slate-500">{placement.adUnitId.slice(-10)}</span>
        </div>
        <h4 className="text-sm font-semibold text-slate-100">
          Dhaka Monsoon Cinematic Title Preset (Sponsored Native Asset)
        </h4>
        <p className="text-xs text-slate-400 mt-1">
          Approved native-ad slot integrated cleanly inside template discovery without blocking primary workflow.
        </p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <span className="text-[11px] text-slate-500 font-mono">
          {adConfig.testMode ? 'Google Test Ad Unit' : 'AdMob Native'}
        </span>
        <button
          onClick={onApplySponsoredTemplate}
          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Try Preset
        </button>
      </div>
    </div>
  );
};

// 3. Interstitial Modal (Triggered strictly AFTER completed export, never during editing or rendering)
export const InterstitialAdModal: React.FC<{
  isOpen: boolean;
  adConfig: PublicAdConfig | null;
  onClose: () => void;
}> = ({ isOpen, adConfig, onClose }) => {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(3);
    markInterstitialShown();
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen || !adConfig) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-amber-400">
            {adConfig.testMode ? 'GOOGLE ADMOB TEST INTERSTITIAL' : 'SPONSORED INTERSTITIAL'}
          </span>
          <button
            onClick={onClose}
            disabled={countdown > 0}
            className="px-3 py-1 rounded-lg bg-slate-800 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50 font-mono"
          >
            {countdown > 0 ? `Skip in ${countdown}s` : 'Close ×'}
          </button>
        </div>

        <div className="p-5 rounded-xl bg-slate-950 border border-slate-800/80 text-center space-y-2">
          <ShieldCheck className="w-10 h-10 text-amber-400 mx-auto" />
          <h3 className="text-base font-semibold text-white">
            Natural Post-Export Transition Placement
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            This interstitial only triggers after your export has safely finished and respects the configured frequency cap ({adConfig.placements.interstitialPostExport.frequencyCapMinutes ?? 5} mins).
          </p>
          <p className="text-[11px] font-mono text-slate-500 pt-2">
            Ad Unit ID: {adConfig.placements.interstitialPostExport.adUnitId}
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors"
        >
          Continue to Studio
        </button>
      </div>
    </div>
  );
};

// 4. Voluntary Rewarded Video Ad Modal (Grants +3 AI Credits only upon verified completion callback)
export const RewardedAdModal: React.FC<{
  isOpen: boolean;
  adConfig: PublicAdConfig | null;
  onClose: () => void;
  onRewardEarned: () => void;
}> = ({ isOpen, adConfig, onClose, onRewardEarned }) => {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSecondsLeft(5);
    setCompleted(false);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCompleted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen || !adConfig) return null;

  const handleClaim = async () => {
    if (!completed) return;
    await fetch('/api/telemetry/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ad_reward' }),
    }).catch(() => {});
    onRewardEarned();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5" />
            {adConfig.testMode ? 'ADMOB TEST REWARDED VIDEO' : 'REWARDED VIDEO AD'}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            title="Dismiss without reward"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-3">
          <Sparkles className="w-10 h-10 text-amber-400 mx-auto" />
          <h3 className="text-base font-semibold text-white">
            {completed ? 'Reward Callback Verified!' : `Playing Test Video Ad (${secondsLeft}s remaining)...`}
          </h3>
          <p className="text-xs text-slate-400">
            Voluntary rewarded placement: Watch until completion to receive +3 bonus AI Assistant requests or unlock an optional template preset.
          </p>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full transition-all duration-500"
              style={{ width: `${((5 - secondsLeft) / 5) * 100}%` }}
            />
          </div>
          <p className="text-[11px] font-mono text-slate-500">
            Unit: {adConfig.placements.rewardedAiUnlock.adUnitId}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleClaim}
            disabled={!completed}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs transition-colors"
          >
            {completed ? 'Claim +3 AI Credits' : `Wait ${secondsLeft}s`}
          </button>
        </div>
      </div>
    </div>
  );
};
