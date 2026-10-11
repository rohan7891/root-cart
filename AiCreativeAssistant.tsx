import React, { useState } from 'react';
import {
  Sparkles,
  FileText,
  Languages,
  Hash,
  Scissors,
  Volume2,
  Mic,
  Upload,
  Play,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Language, SharedMediaAsset } from '../types/studio';
import { t } from '../i18n/translations';
import { PublicAdConfig, RewardedAdModal } from './AdPlacements';
import { saveMediaAssetToDB } from '../services/storageService';

interface AiAssistantProps {
  lang: Language;
  adConfig: PublicAdConfig | null;
  aiEnabled: boolean;
  onSaveAssetToLibrary: (asset: SharedMediaAsset) => void;
}

export const AiCreativeAssistant: React.FC<AiAssistantProps> = ({
  lang,
  adConfig,
  aiEnabled,
  onSaveAssetToLibrary,
}) => {
  const [activeTool, setActiveTool] = useState<
    'script' | 'subtitles_translate' | 'social_pack' | 'smart_cuts' | 'tts' | 'transcribe'
  >('script');
  const [promptInput, setPromptInput] = useState<string>(
    'Create a 30-second high-energy travel reel script showcasing Old Dhaka street food and river ferries at sunset.'
  );
  const [targetLanguage, setTargetLanguage] = useState<'en' | 'bn'>('bn');
  const [voiceName, setVoiceName] = useState<'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr'>('Kore');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [textResult, setTextResult] = useState<string>('');
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [showRewardedModal, setShowRewardedModal] = useState<boolean>(false);

  const handleRunTextTool = async () => {
    if (!promptInput.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setTextResult('');

    try {
      const res = await fetch('/api/ai/creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskType: activeTool,
          prompt: promptInput,
          targetLanguage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'AI request failed.');
      } else {
        setTextResult(data.result || '');
        if (typeof data.remainingQuota === 'number') {
          setRemainingQuota(data.remainingQuota);
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error contacting AI backend.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTtsTool = async () => {
    if (!promptInput.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);
    setAudioDataUrl(null);

    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: promptInput,
          voiceName,
          stylePrompt: 'Warm, articulate documentary & social video creator voiceover',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'TTS Voiceover synthesis failed.');
      } else if (data.audioDataUrl) {
        setAudioDataUrl(data.audioDataUrl);
        if (typeof data.remainingQuota === 'number') {
          setRemainingQuota(data.remainingQuota);
        }
        const asset: SharedMediaAsset = {
          id: `ast_tts_${Date.now()}`,
          name: `AI Voiceover (${voiceName})`,
          type: 'audio',
          mimeType: 'audio/wav',
          sizeBytes: Math.round((data.audioDataUrl.length * 3) / 4),
          dataUrl: data.audioDataUrl,
          folder: 'AI Generated',
          createdAt: new Date().toISOString(),
        };
        saveMediaAssetToDB(asset).catch(() => {});
        onSaveAssetToLibrary(asset);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error generating voiceover.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranscribeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setErrorMsg(null);
    setTextResult('');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result || '');
        const res = await fetch('/api/ai/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64,
            mimeType: file.type || 'audio/mp3',
            languageHint: targetLanguage === 'bn' ? 'Bengali (বাংলা)' : 'English',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Audio transcription failed.');
        } else {
          setTextResult(data.transcript || '');
          if (typeof data.remainingQuota === 'number') {
            setRemainingQuota(data.remainingQuota);
          }
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Error uploading audio for transcription.');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!aiEnabled) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
        <h3 className="text-base font-semibold text-white">AI Creative Assistant Disabled</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          The administrator has currently disabled server-side AI features in the Admin Panel. Ordinary local video and photo editing remain 100% operational offline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Quota Strip */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            AI Creative Assistant (Server-Side Protected Gemini SDK)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate scripts, translate English/Bengali subtitles, synthesize WAV voiceovers, and transcribe audio without exposing API keys in the browser.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {remainingQuota !== null && (
            <span className="text-xs font-mono text-slate-300">
              Quota Remaining: <strong className="text-amber-400">{remainingQuota}</strong>
            </span>
          )}
          {adConfig?.globalAdsEnabled && adConfig?.placements?.rewardedAiUnlock?.enabled && (
            <button
              onClick={() => setShowRewardedModal(true)}
              className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium whitespace-nowrap"
            >
              {t(lang, 'watchRewardedAd')}
            </button>
          )}
        </div>
      </div>

      {/* Tool Selector Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {(
          [
            { id: 'script', label: 'Script & Shots', icon: FileText },
            { id: 'subtitles_translate', label: 'EN ↔ বাংলা Subtitles', icon: Languages },
            { id: 'social_pack', label: 'Titles & Hashtags', icon: Hash },
            { id: 'smart_cuts', label: 'Smart Cut & Pacing', icon: Scissors },
            { id: 'tts', label: 'AI Voiceover (WAV)', icon: Volume2 },
            { id: 'transcribe', label: 'Audio Transcribe', icon: Mic },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTool(item.id);
                setErrorMsg(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                activeTool === item.id
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4 mb-1.5 text-amber-400" />
              <div className="text-xs font-semibold truncate">{item.label}</div>
            </button>
          );
        })}
      </div>

      {/* Workspace Input & Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Input Configuration</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Target Language:</span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value as 'en' | 'bn')}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200"
              >
                <option value="en">English</option>
                <option value="bn">বাংলা (Bengali)</option>
              </select>
            </div>
          </div>

          {activeTool === 'transcribe' ? (
            <div className="p-6 rounded-xl bg-slate-950 border border-dashed border-slate-700 text-center space-y-3">
              <Mic className="w-8 h-8 text-amber-400 mx-auto" />
              <div className="text-xs text-slate-300">
                Upload an audio file (MP3, WAV, WebM) to transcribe into subtitle lines via server-side <code className="text-amber-300">gemini-3.5-transcribe</code>.
              </div>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer">
                <Upload className="w-4 h-4" />
                Select Audio File
                <input type="file" accept="audio/*" onChange={handleTranscribeUpload} className="hidden" />
              </label>
            </div>
          ) : (
            <>
              <textarea
                rows={5}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Describe your video concept, paste captions to translate, or enter voiceover text..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />

              {activeTool === 'tts' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Select Prebuilt Studio Voice (<code className="text-amber-300">gemini-3.8-flash-lite-tts</code>)
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setVoiceName(v)}
                        className={`py-1.5 rounded-lg text-xs font-mono border ${
                          voiceName === v
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={activeTool === 'tts' ? handleRunTtsTool : handleRunTextTool}
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processing on Protected Backend...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {activeTool === 'tts' ? 'Synthesize Studio Voiceover (.WAV)' : 'Generate with Gemini 3.8 Flash'}
                  </>
                )}
              </button>
            </>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
              <span>{errorMsg}</span>
              <button
                onClick={activeTool === 'tts' ? handleRunTtsTool : handleRunTextTool}
                className="px-2.5 py-1 rounded bg-rose-800 text-white shrink-0"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Output Panel */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-4">
          <h3 className="text-sm font-semibold text-white">Generated Studio Output</h3>

          {audioDataUrl && (
            <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3">
              <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                24kHz WAV Voiceover Synthesized & Saved to Shared Library
              </div>
              <audio controls src={audioDataUrl} className="w-full" />
              <a
                href={audioDataUrl}
                download={`rootcart_voiceover_${voiceName}.wav`}
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:underline"
              >
                <Download className="w-3.5 h-3.5" /> Download .WAV File
              </a>
            </div>
          )}

          <div className="flex-1 min-h-[200px] p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap overflow-y-auto font-sans leading-relaxed">
            {textResult || 'Run any creative tool on the left to view scripts, bilingual subtitles, or transcriptions here.'}
          </div>
        </div>
      </div>

      <RewardedAdModal
        isOpen={showRewardedModal}
        adConfig={adConfig}
        onClose={() => setShowRewardedModal(false)}
        onRewardEarned={() => {
          setRemainingQuota((q) => (q !== null ? q + 3 : 25));
        }}
      />
    </div>
  );
};
