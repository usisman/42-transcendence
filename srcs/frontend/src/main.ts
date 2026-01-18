import './styles.css';
import { Router } from './router';
import { renderAuthView } from './views/auth';
import { renderDashboardView } from './views/dashboard';
import { renderGameView } from './views/game';
import { renderTournamentView } from './views/tournament';
import { renderGameSessionView } from './views/game-session';
import { renderUserProfileView } from './views/user-profile';
import { loadSession } from './utils/storage';
import { fetchSessionStatus } from './utils/session';

const root = document.getElementById('app');

if (!root) {
  document.body.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#0f172a;">Uygulama yüklenemedi.</div>';
} else {
  const router = new Router(root);
  router.register({ path: '/auth', render: renderAuthView });
  router.register({ path: '/dashboard', render: renderDashboardView });
  router.register({ path: '/game', render: renderGameView });
  router.register({ path: '/tournament', render: renderTournamentView });
  router.register({ path: '/game-session', render: renderGameSessionView });
  router.register({ path: '/user', render: renderUserProfileView });

  const init = async () => {
    await fetchSessionStatus();
    const session = loadSession();
    const currentPath = (location.hash.replace(/^#/, '').split('?')[0]) || '';
    const protectedPaths = ['/dashboard', '/game', '/tournament', '/game-session', '/user'];

    if (protectedPaths.includes(currentPath) && !session) {
      router.navigate('/auth', { replace: true });
    } else if (!currentPath && session) {
      router.navigate('/dashboard', { replace: true });
    }

    router.init();
  };

  void init();
}
