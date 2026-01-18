import { loadSession, clearSession } from '../utils/storage';
import { fetchSessionStatus } from '../utils/session';
import { escapeHtml } from '../utils/sanitize';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type GameSessionDetail = {
  id: number;
  player1: {
    id: number | null;
    nickname: string;
    score: number;
  };
  player2: {
    id: number | null;
    nickname: string;
    score: number;
  };
  winner: {
    id: number | null;
    nickname: string;
  };
  gameType: string;
  tournamentId: number | null;
  matchId: string | null;
  startedAt: string;
  endedAt: string;
  duration: number;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const renderGameSessionView = (container: HTMLElement) => {
  let session = loadSession();
  if (!session) {
    location.hash = '/auth';
    return;
  }

  const hash = location.hash.replace(/^#/, '');
  const urlParams = new URLSearchParams(hash.split('?')[1] || '');
  const sessionId = urlParams.get('id');

  if (!sessionId) {
    location.hash = '/dashboard';
    return;
  }

  const ensureAuthenticated = async () => {
    const status = await fetchSessionStatus();
    if (!status.authenticated || !status.user) {
      clearSession();
      location.hash = '/auth';
      return false;
    }
    session = status.user;
    return true;
  };

  container.className = '';
  container.style.cssText = '';

  const root = document.createElement('main');
  root.className = 'min-h-screen bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900';

  root.innerHTML = `
    <header class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg border-b border-slate-700/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex items-center justify-between">
          <h1 class="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent tracking-tight pb-2 leading-tight">Maç Detayları</h1>
          <button class="px-6 py-3 rounded-xl font-bold text-sm bg-white/10 backdrop-blur-sm text-sky-400 border-2 border-sky-500/30 transition-all duration-300 hover:bg-sky-500/20 hover:border-sky-500/50 hover:text-sky-300 hover:scale-105 transform" type="button" data-action="back">Geri</button>
        </div>
      </div>
    </header>
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div id="session-content" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
        <p class="mt-4 text-slate-400">Yükleniyor...</p>
      </div>
    </div>
  `;

  container.appendChild(root);

  const loadSessionDetail = async () => {
    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const response = await fetch(`/api/game-sessions/${sessionId}`, { credentials: 'include' });
      
      if (!response.ok) {
        if (response.status === 401) {
          clearSession();
          location.hash = '/auth';
          return;
        }
        const content = root.querySelector('#session-content');
        if (content) {
          content.innerHTML = `
            <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
              <p class="text-red-700 font-semibold">Maç detayları yüklenemedi.</p>
            </div>
          `;
        }
        return;
      }

      const sessionData = (await response.json()) as GameSessionDetail;
      const currentUserNickname = session.nickname;
      const isPlayer1 = sessionData.player1.nickname === currentUserNickname;
      const isWinner = sessionData.winner.nickname === currentUserNickname;

      const content = root.querySelector('#session-content');
      if (!content) return;

      content.innerHTML = `
        <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
          <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Maç Özeti</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <span class="text-slate-600 font-semibold">Tarih</span>
              <span class="text-slate-900 font-bold">${formatDate(sessionData.endedAt)}</span>
            </div>
            <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <span class="text-slate-600 font-semibold">Süre</span>
              <span class="text-slate-900 font-bold">${formatDuration(sessionData.duration)}</span>
            </div>
            ${sessionData.gameType === 'tournament' ? `
            <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <span class="text-slate-600 font-semibold">Oyun Tipi</span>
              <span class="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
                Turnuva
              </span>
            </div>
            ` : ''}
          </div>
        </section>

        <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
          <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Skorlar</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="rounded-2xl p-6 shadow-xl border-2 ${
              isPlayer1 && isWinner
                ? 'bg-gradient-to-br from-green-500 to-green-600 border-green-400'
                : isPlayer1 && !isWinner
                ? 'bg-gradient-to-br from-red-500 to-red-600 border-red-400'
                : 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-400'
            } text-white">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-bold">${escapeHtml(sessionData.player1.nickname)}</h3>
                ${isPlayer1 && isWinner ? '<span class="text-2xl">🏆</span>' : ''}
              </div>
              <p class="text-4xl font-extrabold">${sessionData.player1.score}</p>
            </div>
            <div class="rounded-2xl p-6 shadow-xl border-2 ${
              !isPlayer1 && isWinner
                ? 'bg-gradient-to-br from-green-500 to-green-600 border-green-400'
                : !isPlayer1 && !isWinner
                ? 'bg-gradient-to-br from-red-500 to-red-600 border-red-400'
                : 'bg-gradient-to-br from-slate-500 to-slate-600 border-slate-400'
            } text-white">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-bold">${escapeHtml(sessionData.player2.nickname)}</h3>
                ${!isPlayer1 && isWinner ? '<span class="text-2xl">🏆</span>' : ''}
              </div>
              <p class="text-4xl font-extrabold">${sessionData.player2.score}</p>
            </div>
          </div>
        </section>

        <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10 mb-8">
          <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Skor Dağılımı</h2>
          <div class="relative h-64">
            <canvas id="scoreChart"></canvas>
          </div>
        </section>

        <section class="rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10">
          <h2 class="text-3xl font-extrabold text-slate-900 mb-6 relative pb-4 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-20 after:h-1 after:bg-gradient-to-r after:from-sky-500 after:to-indigo-600 after:rounded-full">Detaylar</h2>
          <div class="space-y-4">
            <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <span class="text-slate-600 font-semibold">Başlangıç</span>
              <span class="text-slate-900 font-bold">${formatDate(sessionData.startedAt)}</span>
            </div>
            <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <span class="text-slate-600 font-semibold">Bitiş</span>
              <span class="text-slate-900 font-bold">${formatDate(sessionData.endedAt)}</span>
            </div>
            <div class="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200">
              <span class="text-slate-600 font-semibold">Kazanan</span>
              <span class="text-slate-900 font-bold">${escapeHtml(sessionData.winner.nickname)}</span>
            </div>
          </div>
        </section>
      `;

      const scoreChartCanvas = root.querySelector<HTMLCanvasElement>('#scoreChart');
      if (scoreChartCanvas) {
        const ctx = scoreChartCanvas.getContext('2d');
        if (ctx) {
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: [escapeHtml(sessionData.player1.nickname), escapeHtml(sessionData.player2.nickname)],
              datasets: [
                {
                  label: 'Skor',
                  data: [sessionData.player1.score, sessionData.player2.score],
                  backgroundColor: [
                    isPlayer1 && isWinner ? 'rgba(34, 197, 94, 0.8)' : isPlayer1 && !isWinner ? 'rgba(239, 68, 68, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                    !isPlayer1 && isWinner ? 'rgba(34, 197, 94, 0.8)' : !isPlayer1 && !isWinner ? 'rgba(239, 68, 68, 0.8)' : 'rgba(100, 116, 139, 0.8)'
                  ],
                  borderColor: [
                    isPlayer1 && isWinner ? 'rgb(34, 197, 94)' : isPlayer1 && !isWinner ? 'rgb(239, 68, 68)' : 'rgb(100, 116, 139)',
                    !isPlayer1 && isWinner ? 'rgb(34, 197, 94)' : !isPlayer1 && !isWinner ? 'rgb(239, 68, 68)' : 'rgb(100, 116, 139)'
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
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    stepSize: 1
                  }
                }
              }
            }
          });
        }
      }

    } catch (error) {
      const content = root.querySelector('#session-content');
      if (content) {
        content.innerHTML = `
          <div class="rounded-3xl bg-red-50 border-2 border-red-200 p-8 text-center">
            <p class="text-red-700 font-semibold">Maç detayları yüklenirken bir hata oluştu.</p>
          </div>
        `;
      }
    }
  };

  void loadSessionDetail();

  const backButton = root.querySelector<HTMLButtonElement>('[data-action="back"]');
  backButton?.addEventListener('click', () => {
    location.hash = '/dashboard';
  });
};

