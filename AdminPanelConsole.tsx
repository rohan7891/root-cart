import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  LogOut,
  Users,
  Sliders,
  Megaphone,
  FileWarning,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface AdminPanelProps {
  onConfigUpdated: () => void;
}

export const AdminPanelConsole: React.FC<AdminPanelProps> = ({ onConfigUpdated }) => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('rootcart_admin_token'));
  const [email, setEmail] = useState<string>('admin@rootcart.app');
  const [password, setPassword] = useState<string>('RootCartSecureAdmin2026!');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'features' | 'ads' | 'audit'>('overview');
  const [userSearch, setUserSearch] = useState<string>('');
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  const fetchDashboard = async (activeToken: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!res.ok) {
        sessionStorage.removeItem('rootcart_admin_token');
        setToken(null);
        return;
      }
      const data = await res.json();
      setDashboardData(data);
    } catch {
      setAuthError('Failed to load Admin Dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDashboard(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
      } else if (data.token) {
        sessionStorage.setItem('rootcart_admin_token', data.token);
        setToken(data.token);
      }
    } catch {
      setAuthError('Network error during administrator login.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    sessionStorage.removeItem('rootcart_admin_token');
    setToken(null);
    setDashboardData(null);
  };

  const handleUpdateUser = async (id: string, updates: { status?: string; role?: string }) => {
    if (!token) return;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      fetchDashboard(token);
      setSaveBanner('User role/status updated and recorded in server audit log.');
    }
  };

  const handleSaveFeatures = async (nextFeatures: any) => {
    if (!token) return;
    const res = await fetch('/api/admin/features', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(nextFeatures),
    });
    if (res.ok) {
      await fetchDashboard(token);
      onConfigUpdated();
      setSaveBanner('Feature & quota settings saved on server.');
    }
  };

  const handleSaveAds = async (nextAds: any) => {
    if (!token) return;
    const res = await fetch('/api/admin/ads', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(nextAds),
    });
    if (res.ok) {
      await fetchDashboard(token);
      onConfigUpdated();
      setSaveBanner('AdMob configuration and placement rules updated.');
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5">
        <div className="flex items-center gap-2.5">
          <Shield className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="text-base font-bold text-white">Root Cart Server-Side Admin Gate</h2>
            <p className="text-xs text-slate-400">Protected by HMAC Bearer session & role verification</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-1">
          <div className="text-slate-200 font-medium">Development Default Credentials (.env.example):</div>
          <div className="font-mono text-[11px]">Email: admin@rootcart.app</div>
          <div className="font-mono text-[11px]">Pass: RootCartSecureAdmin2026!</div>
        </div>

        <form onSubmit={handleLogin} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Admin Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
            />
          </div>

          {authError && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {loading ? 'Verifying Server Session...' : 'Sign In to Admin Console'}
          </button>
        </form>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-12 text-center text-xs text-slate-400">
        Loading protected Admin Dashboard telemetry...
      </div>
    );
  }

  const { metrics, serviceStatus, users, features, ads, auditLogs } = dashboardData;

  return (
    <div className="space-y-6">
      {/* Admin Top Header */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Root Cart Administration Console (/admin)</h2>
          </div>
          <p className="text-xs text-amber-300/90 mt-1">
            Development Seeded & Runtime Session Telemetry — Clearly labeled so it is never mistaken for fabricated production metrics. No advertisements are rendered inside /admin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchDashboard(token)}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-200 text-xs font-medium flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>

      {saveBanner && (
        <div className="px-4 py-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between text-xs text-emerald-200">
          <span>{saveBanner}</span>
          <button onClick={() => setSaveBanner(null)} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            { id: 'overview', label: '8.1 Dashboard & Status' },
            { id: 'users', label: '8.2 User Management' },
            { id: 'features', label: '8.3 Feature & Quota Controls' },
            { id: 'ads', label: '8.4 AdMob Placement Manager' },
            { id: 'audit', label: '8.5 Security Audit Log' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Registered Users (Dev Seed)', val: metrics.registeredUsers },
              { label: 'Active Users', val: metrics.activeUsers },
              { label: 'Projects Created', val: metrics.projectsCreated },
              { label: 'Video Renders Exported', val: metrics.videoExports },
              { label: 'Photo Copies Exported', val: metrics.photoExports },
              { label: 'AI Requests Processed', val: metrics.aiRequestsProcessed },
              { label: 'Test Ad Impressions', val: metrics.adImpressionsTestMode },
              { label: 'Rewarded Callbacks Granted', val: metrics.adRewardsGrantedTestMode },
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xs text-slate-400">{stat.label}</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-white mt-1">
                  {stat.val}
                </div>
              </div>
            ))}
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-sm font-semibold text-white">Backend & Service Health</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Server-Side Gemini API</div>
                <div className="font-mono text-sm text-emerald-400 mt-1">
                  {serviceStatus.geminiApi === 'operational' ? 'Operational (Key Attached)' : 'Missing GEMINI_API_KEY'}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">AdMob Integration Mode</div>
                <div className="font-mono text-sm text-amber-400 mt-1">
                  {ads.testMode ? 'Official Google Test IDs' : 'Production Configured'}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Storage Architecture</div>
                <div className="font-mono text-sm text-sky-400 mt-1">
                  Client IndexedDB + Express Session Store
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Creator Accounts & Role Authorization</h3>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Projects</th>
                  <th className="py-2.5 px-3 text-right">Exports</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {users
                  .filter(
                    (u: any) =>
                      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
                      u.email.toLowerCase().includes(userSearch.toLowerCase())
                  )
                  .map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-950/50">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white">{u.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{u.email}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200"
                        >
                          <option value="creator">creator</option>
                          <option value="pro_creator">pro_creator</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span className={u.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{u.projectsCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{u.exportsCount}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() =>
                            handleUpdateUser(u.id, {
                              status: u.status === 'active' ? 'suspended' : 'active',
                            })
                          }
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                        >
                          {u.status === 'active' ? 'Suspend' : 'Restore'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'features' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-white">
            Server-Enforced Feature Flags & AI Quotas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-semibold text-white">AI Creative Assistant (/api/ai/*)</div>
                <div className="text-slate-400">Enforces server-side check before invoking Gemini</div>
              </div>
              <input
                type="checkbox"
                checked={features.aiAssistantEnabled}
                onChange={(e) =>
                  handleSaveFeatures({ ...features, aiAssistantEnabled: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4"
              />
            </label>

            <label className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-semibold text-white">AI Multimodal Photo Smart Grade</div>
                <div className="text-slate-400">Controls /api/ai/photo-analyze availability</div>
              </div>
              <input
                type="checkbox"
                checked={features.aiPhotoToolsEnabled}
                onChange={(e) =>
                  handleSaveFeatures({ ...features, aiPhotoToolsEnabled: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4"
              />
            </label>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Hourly AI Quota Per User</div>
                <div className="text-slate-400">Enforced by server rate limiter</div>
              </div>
              <input
                type="number"
                min={1}
                max={200}
                value={features.dailyAiQuotaPerUser}
                onChange={(e) =>
                  handleSaveFeatures({
                    ...features,
                    dailyAiQuotaPerUser: parseInt(e.target.value, 10) || 25,
                  })
                }
                className="w-20 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 font-mono text-white text-right"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-semibold text-white">Max Video Export Resolution</div>
                <div className="text-slate-400">Caps maximum render preset in Video Editor</div>
              </div>
              <select
                value={features.maxExportResolution}
                onChange={(e) =>
                  handleSaveFeatures({ ...features, maxExportResolution: e.target.value })
                }
                className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 font-mono text-white"
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ads' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">
                AdMob Monetization & Placement Configuration
              </h3>
              <p className="text-slate-400 mt-0.5">
                Configure Google AdMob test vs. production mode, App ID, and per-placement visibility.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ads.globalAdsEnabled}
                  onChange={(e) => handleSaveAds({ ...ads, globalAdsEnabled: e.target.checked })}
                  className="accent-amber-500"
                />
                <span className="font-semibold text-white">Global Ads Enabled</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ads.testMode}
                  onChange={(e) => handleSaveAds({ ...ads, testMode: e.target.checked })}
                  className="accent-emerald-500"
                />
                <span className="font-semibold text-emerald-400">Official Google Test Mode</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1">Android AdMob Application ID</label>
              <input
                type="text"
                value={ads.androidAppId}
                onChange={(e) => handleSaveAds({ ...ads, androidAppId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Primary Provider / Mediation</label>
              <select
                value={ads.provider}
                onChange={(e) => handleSaveAds({ ...ads, provider: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
              >
                <option value="admob">Google AdMob (Primary Android SDK)</option>
                <option value="applovin_max_ready">AppLovin MAX Mediation Adapter Ready</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            {Object.entries(ads.placements).map(([key, place]: [string, any]) => (
              <div
                key={key}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-white">{key}</div>
                  <div className="text-slate-400">{place.location}</div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={place.adUnitId}
                    onChange={(e) => {
                      const nextPlacements = {
                        ...ads.placements,
                        [key]: { ...place, adUnitId: e.target.value },
                      };
                      handleSaveAds({ ...ads, placements: nextPlacements });
                    }}
                    className="w-64 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-200"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={place.enabled}
                      onChange={(e) => {
                        const nextPlacements = {
                          ...ads.placements,
                          [key]: { ...place, enabled: e.target.checked },
                        };
                        handleSaveAds({ ...ads, placements: nextPlacements });
                      }}
                      className="accent-amber-500"
                    />
                    <span>Enabled</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
          <h3 className="text-sm font-semibold text-white">Immutable Administrative Audit Trail</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {auditLogs.map((log: any) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-mono text-amber-400 font-semibold">{log.action}</span>
                  <span className="text-slate-500 mx-2">·</span>
                  <span className="text-slate-200">{log.details}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  {log.actorEmail} · {new Date(log.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
