import { clearSession, loadSession, persistSession } from '../utils/storage';
import { fetchSessionStatus } from '../utils/session';
import { escapeHtml } from '../utils/sanitize';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);
type ProfilePayload = {
  id: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
  createdAt: string;
  avatarUrl: string | null;
};

type UserStatsPayload = {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  totalScore: number;
  avgScore: number;
  longestWinStreak: number;
  recentGames: Array<{
    id: number;
    opponent: string;
    won: boolean;
    score: string;
    gameType: string;
    endedAt: string;
  }>;
  dailyStats: {
    games: number;
    wins: number;
    losses: number;
  };
  weeklyStats: {
    games: number;
    wins: number;
    losses: number;
  };
};

type GameSessionPayload = {
  id: number;
  player1: string;
  player2: string;
  winner: string;
  score: string;
  gameType: string;
  tournamentId: number | null;
  startedAt: string;
  endedAt: string;
  duration: number;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const renderHeader = (nickname: string) => `
  <header class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg border-b border-slate-700/50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div class="flex-1">
          <p class="uppercase text-xs tracking-wider text-slate-400 mb-3 font-bold">Profil</p>
          <h1 class="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent tracking-tight pb-2 leading-tight" data-profile-field="nickname">${escapeHtml(nickname)}</h1>
        </div>
        <div class="flex gap-3 flex-wrap justify-end w-full sm:w-auto">
          <button class="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-500 to-indigo-600 text-white transition-all duration-300 hover:from-sky-600 hover:to-indigo-700 hover:shadow-lg hover:shadow-sky-500/50 hover:scale-105 transform" type="button" data-action="play">Play Now</button>
          <button class="px-6 py-3 rounded-xl font-bold text-sm bg-white/10 backdrop-blur-sm text-sky-400 border-2 border-sky-500/30 transition-all duration-300 hover:bg-sky-500/20 hover:border-sky-500/50 hover:text-sky-300 hover:scale-105 transform" type="button" data-action="tournaments">Turnuvalar</button>
          <button class="px-6 py-3 rounded-xl font-bold text-sm bg-white/10 backdrop-blur-sm text-red-400 border-2 border-red-500/30 transition-all duration-300 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 hover:scale-105 transform" type="button" data-action="logout">Çıkış</button>
        </div>
      </div>
    </div>
  </header>
`;

const getDefaultAvatarUrl = (nickname: string) => {
  const initial = nickname.charAt(0).toUpperCase();
  const colors = [
    'from-blue-500 to-blue-600',
    'from-green-500 to-green-600',
    'from-purple-500 to-purple-600',
    'from-pink-500 to-pink-600',
    'from-orange-500 to-orange-600',
    'from-red-500 to-red-600',
    'from-indigo-500 to-indigo-600',
    'from-teal-500 to-teal-600'
  ];
  const colorIndex = nickname.charCodeAt(0) % colors.length;
  return { initial, colorClass: colors[colorIndex] };
};

const renderAccountSummary = (session: { id: number; nickname: string; provider: 'local' | 'google'; avatarUrl?: string | null }) => {
  const defaultAvatar = getDefaultAvatarUrl(session.nickname);
  const avatarUrl = session.avatarUrl || null;
  
  return `
  <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
    <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Hesap Özeti</h2>
    <div class="flex flex-col md:flex-row gap-8 mb-8">
      <div class="flex flex-col items-center md:items-start">
        <div class="relative group">
          <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-200 shadow-lg ${avatarUrl ? '' : `bg-gradient-to-br ${defaultAvatar.colorClass}`}" data-avatar-container>
            ${avatarUrl 
              ? `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" class="w-full h-full object-cover" data-avatar-image />`
              : `<div class="w-full h-full flex items-center justify-center text-white text-4xl font-bold" data-avatar-initial>${defaultAvatar.initial}</div>`
            }
          </div>
          <label class="absolute bottom-0 right-0 bg-sky-500 text-white rounded-full p-3 cursor-pointer shadow-lg hover:bg-sky-600 transition-colors group-hover:scale-110 transform" data-avatar-upload-label>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <input type="file" id="avatar-upload" name="avatar" autocomplete="off" accept="image/*" class="hidden" data-avatar-input />
          </label>
        </div>
        <p class="mt-4 text-sm text-slate-600 text-center md:text-left">Profil Fotoğrafı</p>
        <p class="text-xs text-slate-500 text-center md:text-left mt-1">Maksimum 5MB</p>
      </div>
      
      <div class="flex-1">
        <dl class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start gap-2 pb-6 border-b border-slate-200 last:border-b-0">
        <dt class="text-sm font-bold text-slate-600 uppercase tracking-wider min-w-[140px]">Kullanıcı ID</dt>
        <dd class="text-slate-900 font-semibold text-lg" data-profile-field="id">#${session.id}</dd>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-start gap-2 pb-6 border-b border-slate-200 last:border-b-0">
        <dt class="text-sm font-bold text-slate-600 uppercase tracking-wider min-w-[140px]">Takma Ad</dt>
        <dd class="flex-1">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-slate-900 font-semibold text-lg" data-profile-field="nicknameInline">${escapeHtml(session.nickname)}</span>
            <button class="p-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 transition-colors duration-200" type="button" data-action="edit-nickname" aria-label="Takma adı düzenle">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
            </button>
          </div>
          <form class="hidden flex flex-col gap-3" data-nickname-form>
            <input type="text" name="nickname" autocomplete="username" data-nickname-input value="${escapeHtml(session.nickname)}" minlength="3" maxlength="48" required class="rounded-xl border-2 border-slate-300 bg-white/50 backdrop-blur-sm px-5 py-4 focus:ring-4 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all duration-200"/>
            <div class="flex gap-3">
              <button class="px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 transform" type="submit">Kaydet</button>
              <button class="px-6 py-2.5 rounded-xl font-bold text-sm bg-white/10 backdrop-blur-sm text-slate-600 border-2 border-slate-300 hover:bg-slate-100 transition-all duration-300 hover:scale-105 transform" type="button" data-action="cancel-nickname">Vazgeç</button>
            </div>
            <p class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium mt-2 min-h-[48px] hidden" data-status="nickname"></p>
          </form>
        </dd>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-start gap-2 pb-6 border-b border-slate-200 last:border-b-0">
        <dt class="text-sm font-bold text-slate-600 uppercase tracking-wider min-w-[140px]">Giriş Provider</dt>
        <dd class="text-slate-900 font-semibold text-lg" data-profile-field="providerLabel">${session.provider === 'google' ? 'Google OAuth' : 'Local (manuel)'}</dd>
      </div>
      <div class="flex flex-col sm:flex-row sm:items-start gap-2 pb-6 border-b border-slate-200 last:border-b-0">
        <dt class="text-sm font-bold text-slate-600 uppercase tracking-wider min-w-[140px]">Katılım Tarihi</dt>
        <dd class="text-slate-900 font-semibold text-lg" data-profile-field="createdAt">-</dd>
      </div>
        </dl>
      </div>
    </div>
  </section>
  `;
};

const renderStatsCards = (stats: UserStatsPayload) => `
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    <div class="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-6 shadow-xl text-white">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-blue-100 text-sm font-medium mb-1">Toplam Oyun</p>
          <p class="text-3xl font-bold">${stats.totalGames}</p>
        </div>
        <div class="bg-white/20 rounded-full p-3">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
      </div>
    </div>
    
    <div class="rounded-2xl bg-gradient-to-br from-green-500 to-green-600 p-6 shadow-xl text-white">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-green-100 text-sm font-medium mb-1">Kazanma</p>
          <p class="text-3xl font-bold">${stats.wins}</p>
        </div>
        <div class="bg-white/20 rounded-full p-3">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
      </div>
    </div>
    
    <div class="rounded-2xl bg-gradient-to-br from-red-500 to-red-600 p-6 shadow-xl text-white">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-red-100 text-sm font-medium mb-1">Kaybetme</p>
          <p class="text-3xl font-bold">${stats.losses}</p>
        </div>
        <div class="bg-white/20 rounded-full p-3">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
      </div>
    </div>
  </div>
`;

const renderDailyStatsChart = () => `
  <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
    <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Bugünün Aktivitesi</h2>
    <div class="relative h-64">
      <canvas id="dailyStatsChart"></canvas>
    </div>
  </section>
`;

const renderWeeklyStatsChart = () => `
  <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
    <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Haftalık Aktivite (Son 1 Hafta)</h2>
    <div class="relative h-64">
      <canvas id="weeklyStatsChart"></canvas>
    </div>
  </section>
`;

const renderGameHistory = (sessions: GameSessionPayload[], pagination: { page: number; totalPages: number; total: number }, currentNickname: string) => `
  <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10">
    <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Tüm Oyun Geçmişi</h2>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b-2 border-slate-200">
            <th class="text-left py-3 px-4 font-bold text-slate-700">Rakip</th>
            <th class="text-left py-3 px-4 font-bold text-slate-700">Skor</th>
            <th class="text-left py-3 px-4 font-bold text-slate-700">Sonuç</th>
            <th class="text-left py-3 px-4 font-bold text-slate-700">Tip</th>
            <th class="text-left py-3 px-4 font-bold text-slate-700">Tarih</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.length === 0 
            ? '<tr><td colspan="5" class="text-center py-8 text-slate-600">Henüz oyun oynamadınız.</td></tr>'
            : sessions.map(session => `
              <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" data-session-id="${session.id}" style="cursor: pointer;">
                <td class="py-3 px-4 font-semibold text-slate-900">
                  ${escapeHtml(session.player1)} vs ${escapeHtml(session.player2)}
                </td>
                <td class="py-3 px-4 text-slate-700">${session.score}</td>
                <td class="py-3 px-4">
                  <span class="px-3 py-1 rounded-lg text-sm font-semibold ${
                    session.winner === currentNickname 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }">
                    ${session.winner === currentNickname ? 'Kazandın' : 'Kaybettin'}
                  </span>
                </td>
                <td class="py-3 px-4">
                  ${session.gameType === 'tournament' ? `
                  <span class="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                    Turnuva
                  </span>
                  ` : ''}
                </td>
                <td class="py-3 px-4 text-slate-600 text-sm">${formatDate(session.endedAt)}</td>
              </tr>
            `).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagination.totalPages > 1 ? `
      <div class="flex items-center justify-between mt-6">
        <p class="text-slate-600">Toplam ${pagination.total} oyun</p>
        <div class="flex gap-2">
          <button 
            class="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            data-pagination="prev"
            ${pagination.page === 1 ? 'disabled' : ''}
          >
            Önceki
          </button>
          <span class="px-4 py-2 text-slate-700 font-semibold">
            Sayfa ${pagination.page} / ${pagination.totalPages}
          </span>
          <button 
            class="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
            data-pagination="next"
            ${pagination.page === pagination.totalPages ? 'disabled' : ''}
          >
            Sonraki
          </button>
        </div>
      </div>
    ` : ''}
  </section>
`;

const renderFriendsSection = () => `
  <section id="friends-section" class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h2 class="text-3xl font-extrabold text-slate-900 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Arkadaşlar</h2>
      <button class="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-500 to-indigo-600 text-white transition-all duration-300 hover:from-sky-600 hover:to-indigo-700 hover:shadow-lg hover:shadow-sky-500/50 hover:scale-105 transform" type="button" data-action="open-friend-search">Arkadaş Ekle</button>
    </div>
    <div id="friends-content">
      <div class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
        <p class="mt-4 text-slate-400">Arkadaşlar yükleniyor...</p>
      </div>
    </div>
  </section>

  <div id="friend-search-modal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-slate-200 p-6 flex justify-between items-center">
        <h3 class="text-2xl font-bold text-slate-900">Arkadaş Ara</h3>
        <button class="text-slate-400 hover:text-slate-600 transition-colors" type="button" data-action="close-friend-search">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="p-6">
        <div class="mb-6">
          <input 
            type="text" 
            id="friend-search-input" 
            name="friendSearch"
            autocomplete="off"
            placeholder="Kullanıcı adı ara..." 
            class="w-full rounded-xl border-2 border-slate-300 bg-white/50 backdrop-blur-sm px-5 py-4 focus:ring-4 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all duration-200"
            data-action="search-users"
          />
        </div>
        <div id="friend-search-results" class="space-y-3">
          <p class="text-center text-slate-500 py-8">Arama yapmak için yukarıdaki alana kullanıcı adı yazın...</p>
        </div>
      </div>
    </div>
  </div>
`;

export const renderDashboardView = (container: HTMLElement) => {
  let session = loadSession();
  if (!session) {
    location.hash = '/auth';
    return;
  }
  container.className = '';
  container.style.cssText = '';

  const root = document.createElement('main');
  root.className = 'min-h-screen bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900';
  root.innerHTML = `
    ${renderHeader(session.nickname)}
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      ${renderAccountSummary(session)}
      <div id="stats-section" class="mb-8">
        <div class="text-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p class="mt-4 text-slate-400">İstatistikler yükleniyor...</p>
        </div>
      </div>
      ${renderFriendsSection()}
    </div>
  `;

  container.appendChild(root);

  let isActive = true;
  const abortController = new AbortController();
  const fetchAuthed = (input: RequestInfo | URL, init: RequestInit = {}) =>
    fetch(input, { ...init, credentials: 'include', signal: abortController.signal });

  const applyProfile = (profile: ProfilePayload) => {
    if (!session) return;
    session = { 
      id: profile.id,
      email: profile.email,
      nickname: profile.nickname,
      provider: profile.provider,
      avatarUrl: profile.avatarUrl
    };
    persistSession(session);
    const setText = (selector: string, value: string) => {
      const node = root.querySelector<HTMLElement>(selector);
      if (node) node.textContent = value;
    };

    setText('[data-profile-field="nickname"]', profile.nickname);
    setText('[data-profile-field="id"]', `#${profile.id}`);
    setText('[data-profile-field="nicknameInline"]', profile.nickname);
    setText(
      '[data-profile-field="providerLabel"]',
      profile.provider === 'google' ? 'Google OAuth' : 'Local (manuel)'
    );
    setText('[data-profile-field="createdAt"]', formatDate(profile.createdAt));

    const avatarImage = root.querySelector<HTMLImageElement>('[data-avatar-image]'); 
    if (profile.avatarUrl) { 
      if (avatarImage) { 
        avatarImage.src = profile.avatarUrl; 
      } else {
        const container = root.querySelector('[data-avatar-container]'); 
        const initial = root.querySelector('[data-avatar-initial]'); 
        if (container) { 
          initial?.remove(); 
          const img = document.createElement('img'); 
          img.src = profile.avatarUrl; 
          img.alt = 'Avatar'; 
          img.className = 'w-full h-full object-cover'; 
          img.setAttribute('data-avatar-image', ''); 
          container.appendChild(img); } } }
  };

  const loadStats = async () => {
    if (!session) return;
    if (!isActive) return;
    const statsSection = root.querySelector('#stats-section');
    if (!statsSection) return;

    try {
      const [statsResponse, sessionsResponse] = await Promise.all([
        fetchAuthed('/api/users/stats', { credentials: 'include' }),
        fetchAuthed('/api/game-sessions?page=1&limit=10', { credentials: 'include' })
      ]);

      if (!statsResponse.ok || !sessionsResponse.ok) {
        if (statsSection) {
          statsSection.innerHTML = `
            <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
              <p class="text-red-700 font-semibold">İstatistikler yüklenemedi.</p>
            </div>
          `;
        }
        return;
      }

      const stats = (await statsResponse.json()) as UserStatsPayload;
      const sessionsData = (await sessionsResponse.json()) as { sessions: GameSessionPayload[]; pagination: any };

      statsSection.innerHTML = `
        ${renderStatsCards(stats)}
        ${renderDailyStatsChart()}
        ${renderWeeklyStatsChart()}
        ${renderGameHistory(sessionsData.sessions, sessionsData.pagination, session.nickname)}
      `;

      const dailyChartCanvas = statsSection.querySelector<HTMLCanvasElement>('#dailyStatsChart');
      if (dailyChartCanvas) {
        const ctx = dailyChartCanvas.getContext('2d');
        if (ctx) {
          const hasGames = stats.dailyStats.games > 0;
          const wins = stats.dailyStats.wins || 0;
          const losses = stats.dailyStats.losses || 0;
          
          if (!hasGames || (wins === 0 && losses === 0)) {
            const canvasContainer = dailyChartCanvas.parentElement;
            if (canvasContainer) {
              canvasContainer.innerHTML = '<p class="text-center text-slate-500 py-8">Bugün henüz oyun oynamadınız.</p>';
            }
          } else {
            new Chart(ctx, {
              type: 'pie',
              data: {
                labels: ['Kazanma', 'Kaybetme'],
                datasets: [
                  {
                    data: [wins, losses],
                    backgroundColor: [
                      'rgba(34, 197, 94, 0.8)',
                      'rgba(239, 68, 68, 0.8)'
                    ],
                    borderColor: [
                      'rgb(34, 197, 94)',
                      'rgb(239, 68, 68)'
                    ],
                    borderWidth: 2
                  }
                ]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      padding: 15,
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                        return `${label}: ${value} (${percentage}%)`;
                      }
                    }
                  }
                }
              }
            });
          }
        }
      }

      const weeklyChartCanvas = statsSection.querySelector<HTMLCanvasElement>('#weeklyStatsChart');
      if (weeklyChartCanvas) {
        const ctx = weeklyChartCanvas.getContext('2d');
        if (ctx) {
          const hasGames = stats.weeklyStats.games > 0;
          const wins = stats.weeklyStats.wins || 0;
          const losses = stats.weeklyStats.losses || 0;
          
          if (!hasGames || (wins === 0 && losses === 0)) {
            const canvasContainer = weeklyChartCanvas.parentElement;
            if (canvasContainer) {
              canvasContainer.innerHTML = '<p class="text-center text-slate-500 py-8">Son 1 haftada henüz oyun oynamadınız.</p>';
            }
          } else {
            new Chart(ctx, {
              type: 'pie',
              data: {
                labels: ['Kazanma', 'Kaybetme'],
                datasets: [
                  {
                    data: [wins, losses],
                    backgroundColor: [
                      'rgba(34, 197, 94, 0.8)',
                      'rgba(239, 68, 68, 0.8)'
                    ],
                    borderColor: [
                      'rgb(34, 197, 94)',
                      'rgb(239, 68, 68)'
                    ],
                    borderWidth: 2
                  }
                ]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      padding: 15,
                      font: {
                        size: 14,
                        weight: 'bold'
                      }
                    }
                  },
                  tooltip: {
                    callbacks: {
                      label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                        return `${label}: ${value} (${percentage}%)`;
                      }
                    }
                  }
                }
              }
            });
          }
        }
      }

      let currentPage = 1;
      
      const loadGameSessions = async (page: number) => {
        if (!session) return;
        if (!isActive) return;
        try {
          const response = await fetchAuthed(`/api/game-sessions?page=${page}&limit=10`, { credentials: 'include' });
          if (!response.ok) {
            const historySection = root.querySelector('section:last-child');
            if (historySection) {
              historySection.innerHTML = `
                <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
                  <p class="text-red-700 font-semibold">Oyun geçmişi yüklenemedi.</p>
                </div>
              `;
            }
            return;
          }
          const data = (await response.json()) as { sessions: GameSessionPayload[]; pagination: any };
          
          const historySection = root.querySelector('section:last-child');
          if (historySection) {
            historySection.innerHTML = renderGameHistory(data.sessions, data.pagination, session.nickname);
            currentPage = page;
            
            const newPrevButton = root.querySelector('[data-pagination="prev"]');
            const newNextButton = root.querySelector('[data-pagination="next"]');
            
            newPrevButton?.addEventListener('click', () => {
              if (currentPage > 1) loadGameSessions(currentPage - 1);
            });
            
            newNextButton?.addEventListener('click', () => {
              if (currentPage < data.pagination.totalPages) loadGameSessions(currentPage + 1);
            });

            root.querySelectorAll('[data-session-id]').forEach(element => {
              element.addEventListener('click', (e) => {
                const sessionId = (e.currentTarget as HTMLElement).getAttribute('data-session-id');
                if (sessionId) {
                  location.hash = `/game-session?id=${sessionId}`;
                }
              });
            });
          }
        } catch (error) {
        }
      };

      const prevButton = root.querySelector('[data-pagination="prev"]');
      const nextButton = root.querySelector('[data-pagination="next"]');

      prevButton?.addEventListener('click', () => {
        if (currentPage > 1) loadGameSessions(currentPage - 1);
      });

      nextButton?.addEventListener('click', () => {
        if (currentPage < sessionsData.pagination.totalPages) loadGameSessions(currentPage + 1);
      });

      const setupSessionClickHandlers = () => {
        root.querySelectorAll('[data-session-id]').forEach(element => {
          element.addEventListener('click', (e) => {
            const sessionId = (e.currentTarget as HTMLElement).getAttribute('data-session-id');
            if (sessionId) {
              location.hash = `/game-session?id=${sessionId}`;
            }
          });
        });
      };

      setupSessionClickHandlers();

    } catch (error) {
      if (statsSection) {
        statsSection.innerHTML = `
          <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
            <p class="text-red-700 font-semibold">İstatistikler yüklenirken bir hata oluştu.</p>
          </div>
        `;
      }
    }
  };

  const loadProfile = async () => {
    try {
      const response = await fetchAuthed('/api/users/profile', { credentials: 'include' });
      if (!isActive) return;
      if (!response.ok) {
        if (response.status === 401) {
          clearSession();
          location.hash = '/auth';
        }
        return;
      }
      const profile = (await response.json()) as ProfilePayload;
      applyProfile(profile);
    } catch {
      if (!isActive) return;
    }
  };

  type FriendPayload = {
    id: number;
    userId: number;
    friendId: number;
    friendNickname: string;
    friendAvatarUrl: string | null;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
    updatedAt: string;
    isOnline: boolean;
  };

  type FriendsPayload = {
    friends: FriendPayload[];
    requests: {
      sent: FriendPayload[];
      received: FriendPayload[];
    };
  };

  type SearchUserPayload = {
    id: number;
    nickname: string;
    avatarUrl: string | null;
    isFriend: boolean;
    friendStatus: 'none' | 'pending' | 'accepted' | 'rejected';
  };

  const renderFriendItem = (friend: FriendPayload, type: 'friend' | 'sent' | 'received') => {
    const defaultAvatar = getDefaultAvatarUrl(friend.friendNickname);
    const avatarUrl = friend.friendAvatarUrl || null;
    
    return `
      <div class="flex items-center justify-between p-4 rounded-xl border-2 border-slate-200 hover:border-sky-300 transition-colors">
        <div class="flex items-center gap-4 flex-1 cursor-pointer" data-action="view-profile" data-user-id="${friend.friendId}" style="cursor: pointer;">
          <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-200 ${avatarUrl ? '' : `bg-gradient-to-br ${defaultAvatar.colorClass}`}" data-avatar-container>
            ${avatarUrl 
              ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(friend.friendNickname)}" class="w-full h-full object-cover" />`
              : `<div class="w-full h-full flex items-center justify-center text-white text-lg font-bold">${defaultAvatar.initial}</div>`
            }
          </div>
          <div class="flex-1">
            <p class="font-semibold text-slate-900">${escapeHtml(friend.friendNickname)}</p>
            ${type === 'friend' ? `
              <p class="text-xs font-semibold flex items-center gap-2 ${friend.isOnline ? 'text-emerald-600' : 'text-slate-400'}">
                <span class="inline-block w-2 h-2 rounded-full ${friend.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                ${friend.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
              </p>
            ` : ''}
            ${type === 'sent' ? '<p class="text-sm text-slate-500">Gönderilen istek</p>' : ''}
            ${type === 'received' ? '<p class="text-sm text-slate-500">Gelen istek</p>' : ''}
          </div>
        </div>
        <div class="flex gap-2">
          ${type === 'received' ? `
            <button class="px-4 py-2 rounded-lg bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors" data-action="accept-friend" data-friend-id="${friend.id}">
              Kabul Et
            </button>
            <button class="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors" data-action="reject-friend" data-friend-id="${friend.id}">
              Reddet
            </button>
          ` : ''}
          ${type === 'friend' ? `
            <button class="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors" data-action="remove-friend" data-friend-id="${friend.friendId}">
              Kaldır
            </button>
          ` : ''}
          ${type === 'sent' ? `
            <span class="px-4 py-2 rounded-lg bg-slate-200 text-slate-600 font-semibold text-sm">
              Beklemede
            </span>
          ` : ''}
        </div>
      </div>
    `;
  };

  const loadFriends = async () => {
    if (!isActive) return;
    const friendsSection = root.querySelector('#friends-content');
    if (!friendsSection) return;

    try {
      const response = await fetchAuthed('/api/friends', { credentials: 'include' });
      if (!response.ok) {
      if (!response.ok) {
        friendsSection.innerHTML = `
          <div class="rounded-xl bg-red-50 border-2 border-red-200 p-8 text-center">
            <p class="text-red-700 font-semibold">Arkadaşlar yüklenemedi.</p>
          </div>
        `;
        return;
      }
      }

      const data = (await response.json()) as FriendsPayload;

      if (data.friends.length === 0 && data.requests.sent.length === 0 && data.requests.received.length === 0) {
        friendsSection.innerHTML = `
          <div class="text-center py-12">
            <svg class="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-3-3h-4a3 3 0 00-3 3v2zm7-6V9a6 6 0 00-6-6H8a6 6 0 00-6 6v5m6 6h8a3 3 0 003-3V9a3 3 0 00-3-3h-8a3 3 0 00-3 3v8a3 3 0 003 3z"/>
            </svg>
            <p class="text-slate-600 text-lg mb-4">Henüz arkadaşınız yok</p>
            <p class="text-slate-500">"Arkadaş Ekle" butonuna tıklayarak arkadaş ekleyebilirsiniz.</p>
          </div>
        `;
        return;
      }

      let html = '';

      if (data.requests.received.length > 0) {
        html += `
          <div class="mb-6">
            <h3 class="text-xl font-bold text-slate-900 mb-4">Gelen İstekler (${data.requests.received.length})</h3>
            <div class="space-y-3">
              ${data.requests.received.map(friend => renderFriendItem(friend, 'received')).join('')}
            </div>
          </div>
        `;
      }

      if (data.friends.length > 0) {
        html += `
          <div class="mb-6">
            <h3 class="text-xl font-bold text-slate-900 mb-4">Arkadaşlarım (${data.friends.length})</h3>
            <div class="space-y-3">
              ${data.friends.map(friend => renderFriendItem(friend, 'friend')).join('')}
            </div>
          </div>
        `;
      }

      if (data.requests.sent.length > 0) {
        html += `
          <div class="mb-6">
            <h3 class="text-xl font-bold text-slate-900 mb-4">Gönderilen İstekler (${data.requests.sent.length})</h3>
            <div class="space-y-3">
              ${data.requests.sent.map(friend => renderFriendItem(friend, 'sent')).join('')}
            </div>
          </div>
        `;
      }

      friendsSection.innerHTML = html;

      friendsSection.querySelectorAll('[data-action="view-profile"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'BUTTON' || target.closest('button')) {
            return;
          }
          const userId = (e.currentTarget as HTMLElement).getAttribute('data-user-id');
          if (userId) {
            location.hash = `/user?id=${userId}`;
          }
        });
      });

      friendsSection.querySelectorAll('[data-action="accept-friend"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const friendId = (e.currentTarget as HTMLElement).getAttribute('data-friend-id');
          if (!friendId) return;
          
          try {
            const response = await fetchAuthed(`/api/friends/accept/${friendId}`, {
              method: 'POST',
              credentials: 'include'
            });
            
            if (response.ok) {
              await loadFriends();
            } else {
              const error = await response.json().catch(() => ({ message: 'İstek kabul edilemedi.' }));
              alert(error.message || 'İstek kabul edilemedi.');
            }
          } catch (error) {
            alert('Bir hata oluştu.');
          }
        });
      });

      friendsSection.querySelectorAll('[data-action="reject-friend"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const friendId = (e.currentTarget as HTMLElement).getAttribute('data-friend-id');
          if (!friendId) return;
          
          try {
            const response = await fetchAuthed(`/api/friends/reject/${friendId}`, {
              method: 'POST',
              credentials: 'include'
            });
            
            if (response.ok) {
              await loadFriends();
            } else {
              const error = await response.json().catch(() => ({ message: 'İstek reddedilemedi.' }));
              alert(error.message || 'İstek reddedilemedi.');
            }
          } catch (error) {
            alert('Bir hata oluştu.');
          }
        });
      });

      friendsSection.querySelectorAll('[data-action="remove-friend"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const friendId = (e.currentTarget as HTMLElement).getAttribute('data-friend-id');
          if (!friendId) return;
          
          if (!confirm('Bu kişiyi arkadaş listenizden kaldırmak istediğinize emin misiniz?')) {
            return;
          }
          
          try {
            const response = await fetchAuthed(`/api/friends/${friendId}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            
            if (response.ok) {
              await loadFriends();
            } else {
              const error = await response.json().catch(() => ({ message: 'Arkadaş kaldırılamadı.' }));
              alert(error.message || 'Arkadaş kaldırılamadı.');
            }
          } catch (error) {
            alert('Bir hata oluştu.');
          }
        });
      });

    } catch (error) {
      friendsSection.innerHTML = `
        <div class="rounded-xl bg-red-50 border-2 border-red-200 p-8 text-center">
          <p class="text-red-700 font-semibold">Arkadaşlar yüklenirken bir hata oluştu.</p>
        </div>
      `;
    }
  };

  const initData = async () => {
    const status = await fetchSessionStatus();
    if (!status.authenticated || !status.user) {
      clearSession();
      location.hash = '/auth';
      return;
    }
    if (!isActive) return;
    session = status.user;
    persistSession(session);
    await loadProfile();
    await loadStats();
    await loadFriends();
  };

  void initData();

  const openFriendSearchBtn = root.querySelector('[data-action="open-friend-search"]');
  const closeFriendSearchBtn = root.querySelector('[data-action="close-friend-search"]');
  const friendSearchModal = root.querySelector('#friend-search-modal');
  const friendSearchInput = root.querySelector<HTMLInputElement>('#friend-search-input');
  const friendSearchResults = root.querySelector('#friend-search-results');

  let searchTimeout: number | null = null;

  const performUserSearch = async (query: string) => {
    if (!friendSearchResults) return;
    if (!isActive) return;

    if (query.length < 2) {
      friendSearchResults.innerHTML = '<p class="text-center text-slate-500 py-8">Arama yapmak için en az 2 karakter yazın...</p>';
      return;
    }

    friendSearchResults.innerHTML = '<div class="text-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto"></div><p class="mt-4 text-slate-400">Aranıyor...</p></div>';

    try {
      const response = await fetchAuthed(`/api/users/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearSession();
          location.hash = '/auth';
          return;
        }
        friendSearchResults.innerHTML = '<p class="text-center text-red-500 py-8">Arama yapılamadı.</p>';
        return;
      }

      const data = (await response.json()) as { users: SearchUserPayload[] };

      if (data.users.length === 0) {
        friendSearchResults.innerHTML = '<p class="text-center text-slate-500 py-8">Kullanıcı bulunamadı.</p>';
        return;
      }

      friendSearchResults.innerHTML = data.users.map(user => {
        const defaultAvatar = getDefaultAvatarUrl(user.nickname);
        const avatarUrl = user.avatarUrl || null;
        
        let buttonHtml = '';
        if (user.friendStatus === 'none' || user.friendStatus === 'rejected') {
          buttonHtml = `<button class="px-4 py-2 rounded-lg bg-sky-500 text-white font-semibold text-sm hover:bg-sky-600 transition-colors" data-action="add-friend" data-user-id="${user.id}">Arkadaş Ekle</button>`;
        } else if (user.friendStatus === 'pending') {
          buttonHtml = `<span class="px-4 py-2 rounded-lg bg-slate-200 text-slate-600 font-semibold text-sm">İstek Gönderildi</span>`;
        } else if (user.friendStatus === 'accepted') {
          buttonHtml = `<span class="px-4 py-2 rounded-lg bg-green-200 text-green-700 font-semibold text-sm">Arkadaş</span>`;
        }

        return `
          <div class="flex items-center justify-between p-4 rounded-xl border-2 border-slate-200 hover:border-sky-300 transition-colors">
            <div class="flex items-center gap-4 flex-1">
              <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-200 ${avatarUrl ? '' : `bg-gradient-to-br ${defaultAvatar.colorClass}`}">
                ${avatarUrl 
                  ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(user.nickname)}" class="w-full h-full object-cover" />`
                  : `<div class="w-full h-full flex items-center justify-center text-white text-lg font-bold">${defaultAvatar.initial}</div>`
                }
              </div>
              <div>
                <p class="font-semibold text-slate-900">${escapeHtml(user.nickname)}</p>
              </div>
            </div>
            ${buttonHtml}
          </div>
        `;
      }).join('');

      friendSearchResults.querySelectorAll('[data-action="add-friend"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const userId = (e.currentTarget as HTMLElement).getAttribute('data-user-id');
          if (!userId) return;
          
          try {
            const response = await fetchAuthed('/api/friends/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ friendId: Number(userId) })
            });
            
            if (response.ok) {
              if (friendSearchInput) {
                performUserSearch(friendSearchInput.value);
              }
              await loadFriends();
            } else {
              const error = await response.json().catch(() => ({ message: 'Arkadaş eklenemedi.' }));
              alert(error.message || 'Arkadaş eklenemedi.');
            }
          } catch (error) {
            alert('Bir hata oluştu.');
          }
        });
      });

    } catch (error) {
      friendSearchResults.innerHTML = '<p class="text-center text-red-500 py-8">Arama yapılırken bir hata oluştu.</p>';
    }
  };

  openFriendSearchBtn?.addEventListener('click', () => {
    if (friendSearchModal) {
      friendSearchModal.classList.remove('hidden');
      friendSearchInput?.focus();
    }
  });

  closeFriendSearchBtn?.addEventListener('click', () => {
    if (friendSearchModal) {
      friendSearchModal.classList.add('hidden');
      if (friendSearchInput) {
        friendSearchInput.value = '';
      }
      if (friendSearchResults) {
        friendSearchResults.innerHTML = '<p class="text-center text-slate-500 py-8">Arama yapmak için yukarıdaki alana kullanıcı adı yazın...</p>';
      }
    }
  });

  friendSearchModal?.addEventListener('click', (e) => {
    if (e.target === friendSearchModal) {
      (closeFriendSearchBtn as HTMLButtonElement)?.click();
    }
  });

  friendSearchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    searchTimeout = window.setTimeout(() => {
      performUserSearch(query);
    }, 500);
  });

  const playButton = root.querySelector<HTMLButtonElement>('[data-action="play"]');
  playButton?.addEventListener('click', () => {
    location.hash = '/game';
  });

  const tournamentsButton = root.querySelector<HTMLButtonElement>('[data-action="tournaments"]');
  tournamentsButton?.addEventListener('click', () => {
    location.hash = '/tournament';
  });

  const avatarInput = root.querySelector<HTMLInputElement>('[data-avatar-input]');
  avatarInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Sadece resim dosyaları yüklenebilir.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Dosya boyutu 5MB\'dan büyük olamaz.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetchAuthed('/api/users/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Avatar yüklenemedi.' }));
        alert(error.message || 'Avatar yüklenemedi.');
        return;
      }

      const result = await response.json() as { avatarUrl: string };
      
      const avatarContainer = root.querySelector('[data-avatar-container]');
      const avatarImage = root.querySelector<HTMLImageElement>('[data-avatar-image]');
      const avatarInitial = root.querySelector<HTMLDivElement>('[data-avatar-initial]');
      
      if (avatarContainer && result.avatarUrl) {
        if (avatarImage) {
          avatarImage.src = result.avatarUrl;
        } else {
          if (avatarInitial) {
            avatarInitial.remove();
          }
          const img = document.createElement('img');
          img.src = result.avatarUrl;
          img.alt = 'Avatar';
          img.className = 'w-full h-full object-cover';
          img.setAttribute('data-avatar-image', '');
          avatarContainer.appendChild(img);
          avatarContainer.classList.remove('bg-gradient-to-br');
        }
      }

      const profileResponse = await fetchAuthed('/api/users/profile', { credentials: 'include' });
      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as ProfilePayload;
        applyProfile(profile);
      }
    } catch (error) {
      alert('Avatar yüklenirken bir hata oluştu.');
    } finally {
      if (avatarInput) {
        avatarInput.value = '';
      }
    }
  });

  const logoutButton = root.querySelector<HTMLButtonElement>('[data-action="logout"]');
  logoutButton?.addEventListener('click', async () => {
    isActive = false;
    abortController.abort();

    const gotoAuth = () => {
      if (location.hash !== '#/auth') {
        location.replace(`${location.origin}/#/auth`);
      }
    };

    gotoAuth();
    try {
      await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch {
    } finally {
      clearSession();
      gotoAuth();
    }
  });

  const nicknameForm = root.querySelector<HTMLFormElement>('[data-nickname-form]');
  const nicknameInput = root.querySelector<HTMLInputElement>('[data-nickname-input]');
  const nicknameStatus = root.querySelector<HTMLElement>('[data-status="nickname"]');
  const editNicknameButton = root.querySelector<HTMLButtonElement>('[data-action="edit-nickname"]');
  const cancelNicknameButton = root.querySelector<HTMLButtonElement>('[data-action="cancel-nickname"]');

  const updateNicknameStatus = (type: 'loading' | 'success' | 'error', message = '') => {
    if (!nicknameStatus) return;

    nicknameStatus.classList.remove(
      'bg-green-100', 'text-green-900', 'border-green-400',
      'bg-red-100', 'text-red-900', 'border-red-400',
      'bg-blue-100', 'text-blue-900', 'border-blue-400',
      'hidden', 'shadow-lg', 'border-2'
    );
    nicknameStatus.innerHTML = '';

    nicknameStatus.style.display = 'flex';
    nicknameStatus.classList.remove('hidden');

    if (type === 'loading') {
      nicknameStatus.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-blue-600 flex-shrink-0" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="font-semibold">${message || 'Kaydediliyor...'}</span>
      `;
      nicknameStatus.classList.add('bg-blue-100', 'text-blue-900', 'border-blue-400', 'border-2');
    } else if (!message) {
      nicknameStatus.textContent = '';
      nicknameStatus.classList.add('hidden');
      nicknameStatus.style.display = 'none';
      return;
    } else if (type === 'success') {
      nicknameStatus.innerHTML = `
        <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="font-bold">${message}</span>
      `;
      nicknameStatus.classList.add('bg-green-100', 'text-green-900', 'border-green-400', 'border-2', 'shadow-lg');
      setTimeout(() => {
        nicknameStatus.classList.add('hidden');
        nicknameStatus.style.display = 'none';
        nicknameStatus.textContent = '';
      }, 5000);
    } else if (type === 'error') {
      nicknameStatus.innerHTML = `
        <svg class="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span class="font-bold">${message}</span>
      `;
      nicknameStatus.classList.add('bg-red-100', 'text-red-900', 'border-red-400', 'border-2', 'shadow-lg');
    }
  };

  const normalizeNickname = (value: string) => value.trim().toLowerCase();

  const ensureAuthenticated = async () => {
    const status = await fetchSessionStatus();
    if (!status.authenticated || !status.user) {
      clearSession();
      location.hash = '/auth';
      return false;
    }
    session = status.user;
    persistSession(session);
    return true;
  };

  const checkNicknameAvailability = async (desired: string) => {
    try {
      const response = await fetchAuthed(`/api/users/search?q=${encodeURIComponent(desired)}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearSession();
          location.hash = '/auth';
        }
        return 'unknown' as const;
      }

      const data = (await response.json()) as { users: SearchUserPayload[] };
      const desiredNormalized = normalizeNickname(desired);
      const taken = data.users.some((user) => normalizeNickname(user.nickname) == desiredNormalized);
      return taken ? ('taken' as const) : ('available' as const);
    } catch {
      return 'unknown' as const;
    }
  };

  const setNicknameEditing = (isEditing: boolean) => {
    if (nicknameForm) {
      if (isEditing) {
        nicknameForm.classList.remove('hidden');
        nicknameForm.classList.add('flex');
      } else {
        nicknameForm.classList.add('hidden');
        nicknameForm.classList.remove('flex');
      }
    }
    if (editNicknameButton) {
      if (isEditing) {
        editNicknameButton.classList.add('hidden');
      } else {
        editNicknameButton.classList.remove('hidden');
      }
    }
    if (isEditing) {
      nicknameInput?.focus();
      nicknameInput?.select();
    } else if (nicknameStatus) {
      updateNicknameStatus('error', '');     }
  };

  editNicknameButton?.addEventListener('click', () => {
    if (nicknameInput && session) {
      nicknameInput.value = session.nickname;
    }
    setNicknameEditing(true);
  });

  cancelNicknameButton?.addEventListener('click', () => {
    setNicknameEditing(false);
  });

  nicknameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!nicknameInput) return;
    const nextNickname = nicknameInput.value.trim();
    if (nextNickname.length < 3 || nextNickname.length > 48) {
      updateNicknameStatus('error', 'Takma ad 3-48 karakter arası olmalı.');
      return;
    }
    if (!session) {
      updateNicknameStatus('error', 'Oturum süresi doldu.');
      clearSession();
      location.hash = '/auth';
      return;
    }

    const currentNormalized = normalizeNickname(session.nickname);
    const nextNormalized = normalizeNickname(nextNickname);
    if (currentNormalized == nextNormalized) {
      updateNicknameStatus('error', 'Yeni takma ad mevcut takma adınla aynı.');
      return;
    }

    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      updateNicknameStatus('error', 'Oturum süresi doldu.');
      return;
    }

    const availability = await checkNicknameAvailability(nextNickname);
    if (availability == 'taken') {
      updateNicknameStatus('error', 'Bu takma ad başka bir kullanıcı tarafından kullanılıyor.');
      return;
    }
    if (availability == 'unknown') {
      updateNicknameStatus('error', 'Takma ad doğrulanamadı. Lütfen tekrar dene.');
      return;
    }

    updateNicknameStatus('loading', 'Kaydediliyor...');
    try {
      const response = await fetchAuthed('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nickname: nextNickname })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        updateNicknameStatus('error', payload?.message ?? 'Güncelleme başarısız oldu.');
        return;
      }

      const profile = (await response.json()) as ProfilePayload;
      applyProfile(profile);
      updateNicknameStatus('success', 'Güncellendi.');
      setNicknameEditing(false);
    } catch (error) {
      updateNicknameStatus('error', 'Beklenmeyen bir hata oluştu.');
    }
  });
  return () => {
    isActive = false;
    abortController.abort();
  };
}
