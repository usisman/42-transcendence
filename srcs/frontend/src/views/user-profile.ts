import { loadSession, clearSession } from '../utils/storage';
import { fetchSessionStatus } from '../utils/session';
import { escapeHtml } from '../utils/sanitize';

type UserProfilePayload = {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
  stats: {
    totalGames: number;
    wins: number;
    losses: number;
  };
  isFriend: boolean;
  friendStatus: 'none' | 'pending' | 'accepted' | 'rejected';
};

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

export const renderUserProfileView = (container: HTMLElement) => {
  const session = loadSession();
  if (!session) {
    location.hash = '/auth';
    return;
  }

  const hash = location.hash.replace(/^#/, '');
  const urlParams = new URLSearchParams(hash.split('?')[1] || '');
  const userId = urlParams.get('id');
  if (!userId) {
    location.hash = '/dashboard';
    return;
  }

  container.className = '';
  container.style.cssText = '';

  const root = document.createElement('main');
  root.className = 'min-h-screen bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900';
  root.innerHTML = `
    <header class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg border-b border-slate-700/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div class="flex-1">
            <p class="uppercase text-xs tracking-wider text-slate-400 mb-3 font-bold">Kullanıcı Profili</p>
            <h1 id="profile-nickname" class="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent tracking-tight pb-2 leading-tight">Yükleniyor...</h1>
          </div>
          <div class="flex gap-3 flex-wrap justify-end w-full sm:w-auto">
            <button class="px-6 py-3 rounded-xl font-bold text-sm bg-white/10 backdrop-blur-sm text-sky-400 border-2 border-sky-500/30 transition-all duration-300 hover:bg-sky-500/20 hover:border-sky-500/50 hover:text-sky-300 hover:scale-105 transform" type="button" data-action="back">Geri Dön</button>
          </div>
        </div>
      </div>
    </header>
    <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div id="user-profile-content">
        <div class="text-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p class="mt-4 text-slate-400">Profil yükleniyor...</p>
        </div>
      </div>
    </section>
  `;
  container.appendChild(root);

  const backButton = root.querySelector<HTMLButtonElement>('[data-action="back"]');
  backButton?.addEventListener('click', () => {
    location.hash = '/dashboard';
  });

  const ensureAuthenticated = async () => {
    const status = await fetchSessionStatus();
    if (!status.authenticated || !status.user) {
      clearSession();
      location.hash = '/auth';
      return false;
    }
    return true;
  };

  const loadUserProfile = async () => {
    const contentSection = root.querySelector('#user-profile-content');
    if (!contentSection) return;

    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const response = await fetch(`/api/users/${userId}/profile`, { credentials: 'include' });
      
      if (!response.ok) {
        if (response.status === 401) {
          clearSession();
          location.hash = '/auth';
          return;
        }
        if (response.status === 404) {
          contentSection.innerHTML = `
            <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
              <p class="text-red-700 font-semibold">Kullanıcı bulunamadı.</p>
            </div>
          `;
          return;
        }
        contentSection.innerHTML = `
          <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
            <p class="text-red-700 font-semibold">Profil yüklenemedi.</p>
          </div>
        `;
        return;
      }

      const profile = (await response.json()) as UserProfilePayload;
      const defaultAvatar = getDefaultAvatarUrl(profile.nickname);
      const avatarUrl = profile.avatarUrl || null;

      const nicknameHeader = root.querySelector('#profile-nickname');
      if (nicknameHeader) {
        nicknameHeader.textContent = escapeHtml(profile.nickname);
      }

      contentSection.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10">
            <div class="flex flex-col items-center">
              <div class="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-200 shadow-lg mb-6 ${avatarUrl ? '' : `bg-gradient-to-br ${defaultAvatar.colorClass}`}">
                ${avatarUrl 
                  ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(profile.nickname)}" class="w-full h-full object-cover" />`
                  : `<div class="w-full h-full flex items-center justify-center text-white text-4xl font-bold">${defaultAvatar.initial}</div>`
                }
              </div>
              <h2 class="text-3xl font-extrabold text-slate-900 mb-2">${escapeHtml(profile.nickname)}</h2>
              <p class="text-slate-600 mb-6">Katılım: ${new Date(profile.createdAt).toLocaleDateString()}</p>
              ${profile.isFriend ? '<span class="px-4 py-2 rounded-lg bg-green-100 text-green-700 font-semibold">Arkadaş</span>' : ''}
            </div>
          </div>

          <div class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10">
            <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">İstatistikler</h2>
            <div class="space-y-6">
              <div class="flex justify-between items-center pb-4 border-b border-slate-200">
                <span class="text-slate-600 font-medium">Toplam Oyun</span>
                <span class="text-2xl font-bold text-slate-900">${profile.stats.totalGames}</span>
              </div>
              <div class="flex justify-between items-center pb-4 border-b border-slate-200">
                <span class="text-slate-600 font-medium">Kazanma</span>
                <span class="text-2xl font-bold text-green-600">${profile.stats.wins}</span>
              </div>
              <div class="flex justify-between items-center pb-4 border-b border-slate-200">
                <span class="text-slate-600 font-medium">Kaybetme</span>
                <span class="text-2xl font-bold text-red-600">${profile.stats.losses}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-600 font-medium">Kazanma Oranı</span>
                <span class="text-2xl font-bold text-slate-900">
                  ${profile.stats.totalGames > 0 
                    ? Math.round((profile.stats.wins / profile.stats.totalGames) * 100) 
                    : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      `;

    } catch (error) {
      contentSection.innerHTML = `
        <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
          <p class="text-red-700 font-semibold">Profil yüklenirken bir hata oluştu.</p>
        </div>
      `;
    }
  };

  void loadUserProfile();
};

