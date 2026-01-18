import { clearSession, loadSession } from '../utils/storage';
import { escapeHtml } from '../utils/sanitize';

export const createSessionBanner = (onLogout: () => void) => {
  const storedUser = loadSession();
  const banner = document.createElement('div');
  banner.className = 'session-banner';

  if (!storedUser) {
    banner.classList.add('session-banner--empty');
    banner.innerHTML = `
      <div>
        <strong>Hazırsın.</strong> Kaydol veya giriş yap, oyuna başlayalım.
      </div>
    `;
    return banner;
  }

  banner.innerHTML = `
    <p>Giriş yapıldı: <strong>${escapeHtml(storedUser.nickname)}</strong> (${escapeHtml(
      storedUser.email
    )})</p>
    <div class="session-banner__actions">
      <button class="button" type="button" data-action="play">Play Now</button>
      <button class="button button--secondary" type="button" data-action="logout">Çıkış</button>
    </div>
  `;

  const playButton = banner.querySelector<HTMLButtonElement>('[data-action="play"]');
  if (playButton) {
    playButton.addEventListener('click', () => {
      location.hash = '/dashboard'; // Artık Play Now kullanıcıyı dashboard üzerinden oyuna taşır.
    });
  }

  const logoutButton = banner.querySelector<HTMLButtonElement>('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
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
        onLogout();
        gotoAuth();
      }
    });
  }

  return banner;
};
