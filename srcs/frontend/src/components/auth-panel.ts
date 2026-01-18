import { loadSession, persistSession, type StoredUser } from '../utils/storage';
import { fetchSessionStatus } from '../utils/session';

type SubmitConfig = {
  formId: string;
  endpoint: string;
  buildPayload: (formData: FormData) => Record<string, unknown>;
  successMessage: (data: Record<string, unknown>) => string;
  onSuccess?: (data: Record<string, unknown>) => void;
};

type FormMetadata = {
  formId: string;
  title: string;
  buttonLabel: string;
  renderFields: () => string;
};

const getString = (value: FormDataEntryValue | null): string =>
  typeof value === 'string' ? value : '';

const inputTemplate = (
  label: string,
  name: string,
  type: string,
  placeholder: string,
  options?: { minlength?: number; maxlength?: number; autocomplete?: string }
) => {
  const constraints = [
    options?.minlength ? `minlength="${options.minlength}"` : '',
    options?.maxlength ? `maxlength="${options.maxlength}"` : ''
  ]
    .filter(Boolean)
    .join(' ');

  let autocomplete = options?.autocomplete;
  if (!autocomplete) {
    if (name === 'email') {
      autocomplete = 'email';
    } else if (name === 'password') {
      autocomplete = 'current-password'; // Varsayılan olarak giriş için
    } else if (name === 'nickname') {
      autocomplete = 'username';
    }
  }

  return `
    <label class="flex flex-col gap-3">
      <span class="text-sm font-bold text-slate-800 tracking-wide">${label}</span>
      <input 
        type="${type}" 
        name="${name}" 
        required 
        ${constraints} 
        placeholder="${placeholder}"
        ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
        class="w-full px-5 py-4 rounded-xl border-2 border-slate-200 bg-white/50 backdrop-blur-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-sky-500/20 focus:border-sky-500 transition-all duration-300 shadow-sm hover:shadow-md hover:border-slate-300"
      />
      <small data-feedback-for="${name}" class="text-xs text-red-600 mt-1 min-h-[16px] font-medium"></small>
    </label>
  `;
};

const formMetadata: FormMetadata[] = [
  {
    formId: 'manual-register-form',
    title: 'Manuel Kayıt',
    buttonLabel: 'Kaydı Gönder',
    renderFields: () => `
      ${inputTemplate('E-posta', 'email', 'email', 'ornek@mail.com')}
      ${inputTemplate('Kullanıcı adı', 'nickname', 'text', 'nickname', { minlength: 3, maxlength: 48 })}
      ${inputTemplate('Şifre', 'password', 'password', 'En az 8 karakter', { minlength: 8, autocomplete: 'new-password' })}
    `
  },
  {
    formId: 'manual-login-form',
    title: 'Manuel Giriş',
    buttonLabel: 'Giriş Yap',
    renderFields: () => `
      ${inputTemplate('E-posta', 'email', 'email', 'ornek@mail.com')}
      ${inputTemplate('Şifre', 'password', 'password', 'Şifren', { minlength: 8, autocomplete: 'current-password' })}
    `
  }
];

const createUserFromPayload = (data: Record<string, unknown>): StoredUser | null => {
  const id = Number(data.id);
  const email = data.email;
  const nickname = data.nickname;
  const provider = data.provider;

  if (
    Number.isNaN(id) ||
    typeof email !== 'string' ||
    typeof nickname !== 'string' ||
    (provider !== 'local' && provider !== 'google')
  ) {
    return null;
  }

  return { id, email, nickname, provider };
};

const getSubmitConfigs = (onSessionChange: () => void): SubmitConfig[] => [
  {
    formId: 'manual-register-form',
    endpoint: '/api/users/register',
    buildPayload: (formData) => ({
      email: getString(formData.get('email')),
      nickname: getString(formData.get('nickname')),
      password: getString(formData.get('password'))
    }),
    successMessage: (data) =>
      `Kayıt tamamlandı: ${(data.nickname as string) ?? 'kullanıcı'} (id: ${data.id}).`
  },
  {
    formId: 'manual-login-form',
    endpoint: '/api/users/login',
    buildPayload: (formData) => ({
      email: getString(formData.get('email')),
      password: getString(formData.get('password'))
    }),
    successMessage: () => 'Giriş başarılı. Oturum cookie üzerinde saklandı.',
    onSuccess: (data) => {
      const user = createUserFromPayload(data);
      if (user) {
        persistSession(user);
        onSessionChange();
      }
    }
  },
];

const updateStatus = (
  container: HTMLElement,
  formId: string,
  type: 'loading' | 'success' | 'error',
  message = ''
) => {
  const status = container.querySelector<HTMLDivElement>(`.status[data-status-for="${formId}"]`);
  if (!status) return;

  status.classList.remove('bg-green-50', 'text-green-800', 'border-green-200', 'bg-red-50', 'text-red-800', 'border-red-200', 'bg-blue-50', 'text-blue-800', 'border-blue-200', 'hidden');

  if (type === 'loading') {
    status.innerHTML = `
      <svg class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>İstek gönderiliyor...</span>
    `;
    status.classList.add('bg-blue-50', 'text-blue-800', 'border-blue-300');
    status.style.display = 'flex';
    status.classList.remove('hidden');
    return;
  }

  if (!message) {
    status.innerHTML = '';
    status.classList.add('hidden');
    status.style.display = 'none';
    return;
  }

  status.style.display = 'flex';
  status.classList.remove('hidden');

  if (type === 'success') {
    status.innerHTML = `
      <svg class="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span class="font-bold">${message}</span>
    `;
    status.classList.add('bg-green-100', 'text-green-900', 'border-green-400', 'shadow-lg');
  } else if (type === 'error') {
    status.innerHTML = `
      <svg class="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span class="font-bold">${message}</span>
    `;
    status.classList.add('bg-red-100', 'text-red-900', 'border-red-400', 'shadow-lg');
  }
};

const syncSessionWithServer = async (onSessionChange: () => void) => {
  await fetchSessionStatus();
  onSessionChange();
};

const consumeOauthStatusFromHash = () => {
  const hash = window.location.hash;
  if (!hash.includes('?')) {
    return null;
  }

  const [pathPart, queryPart] = hash.split('?');
  const params = new URLSearchParams(queryPart);
  const status = params.get('oauth');

  if (!status) {
    return null;
  }

  params.delete('oauth');
  const remaining = params.toString();
  const nextHash = remaining ? `${pathPart}?${remaining}` : pathPart || '#/auth';
  history.replaceState(null, '', nextHash);

  return status;
};

const oauthStatusCopy: Record<string, { type: 'success' | 'error'; message: string }> = {
  success: {
    type: 'success',
    message: 'Google ile giriş tamamlandı.'
  },
  denied: {
    type: 'error',
    message: 'Google yetkilendirmesi iptal edildi.'
  },
  missing_params: {
    type: 'error',
    message: 'Google dönüşünde gerekli parametreler eksikti.'
  },
  state_mismatch: {
    type: 'error',
    message: 'Oturum doğrulaması zaman aşımına uğradı, lütfen tekrar deneyin.'
  },
  token_error: {
    type: 'error',
    message: 'Google token alınırken hata oluştu.'
  },
  profile_error: {
    type: 'error',
    message: 'Google profil bilgileri okunamadı.'
  },
  email_unverified: {
    type: 'error',
    message: 'Google hesabınız doğrulanmamış bir e-posta içeriyor.'
  },
  email_conflict: {
    type: 'error',
    message: 'Bu e-posta zaten manuel kayıtla kullanıldığı için Google ile bağlanamadı.'
  },
  internal_error: {
    type: 'error',
    message: 'Google OAuth akışında beklenmeyen bir hata oluştu.'
  }
};

export const createAuthPanel = () => {
  const oauthStatus = consumeOauthStatusFromHash();

  const wrapper = document.createElement('main');
  wrapper.className = 'min-h-screen bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900';

  wrapper.innerHTML = `
    <header class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg border-b border-slate-700/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex items-center">
          <h1 class="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 bg-clip-text text-transparent tracking-tight">
            Transcendence
          </h1>
        </div>
      </div>
    </header>
  `;

  const actionsSection = document.createElement('section');
  actionsSection.className = 'flex flex-col lg:flex-row gap-8 lg:gap-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto items-start mt-16 lg:mt-24 pb-16';

  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'flex flex-col gap-3 w-full lg:w-auto lg:min-w-[260px] lg:sticky lg:top-24';

  const contentContainer = document.createElement('div');
  contentContainer.className = 'flex-1 w-full min-w-0';

  actionsSection.append(buttonsContainer, contentContainer);
  wrapper.appendChild(actionsSection);

  formMetadata.forEach((meta, index) => {
    const section = document.createElement('section');
    const isInitialActive = meta.formId === 'manual-register-form';
    section.className = 'form-section rounded-3xl bg-white/95 backdrop-blur-xl p-10 shadow-2xl border border-white/20 ring-1 ring-white/10';
    section.dataset.section = meta.formId;
    
    if (isInitialActive) {
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
    
    section.innerHTML = `
      <div class="mb-8">
        <h2 class="text-3xl font-extrabold text-slate-900 mb-2">${meta.title}</h2>
        <div class="h-1 w-20 bg-gradient-to-r from-sky-500 to-indigo-600 rounded-full"></div>
      </div>
      <form id="${meta.formId}" class="flex flex-col gap-6">
        ${meta.renderFields()}
        <button type="submit" class="w-full px-6 py-4 rounded-xl font-bold text-base bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] transform">
          ${meta.buttonLabel}
        </button>
      </form>
      <div class="status mt-6 p-5 rounded-xl text-base font-semibold flex items-center gap-3 border-2 hidden min-h-[60px]" data-status-for="${meta.formId}"></div>
    `;
    contentContainer.appendChild(section);
  });

  const header = wrapper.querySelector('header');

  const oauthAlert = document.createElement('div');
  oauthAlert.className = 'hidden mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4';
  header?.insertAdjacentElement('afterend', oauthAlert);

  const renderOauthAlert = (status: string | null) => {
    if (!status) {
      oauthAlert.classList.add('hidden');
      oauthAlert.innerHTML = '';
      oauthAlert.classList.remove('bg-green-50', 'text-green-800', 'border-green-200', 'bg-red-50', 'text-red-800', 'border-red-200');
      return;
    }

    const copy = oauthStatusCopy[status] ?? {
      type: 'error',
      message: 'Google OAuth akışı tamamlanamadı.'
    };

    oauthAlert.classList.remove('bg-green-50', 'text-green-800', 'border-green-200', 'bg-red-50', 'text-red-800', 'border-red-200', 'hidden');

    oauthAlert.innerHTML = `
      <div class="rounded-2xl border-2 p-5 backdrop-blur-xl shadow-2xl ${copy.type === 'success' ? 'bg-green-500/20 text-green-100 border-green-400/30 ring-2 ring-green-500/20' : 'bg-red-500/20 text-red-100 border-red-400/30 ring-2 ring-red-500/20'}">
        <div class="flex items-center">
          ${copy.type === 'success' 
            ? '<svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>'
            : '<svg class="w-6 h-6 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>'
          }
          <span class="font-bold text-base">${copy.message}</span>
        </div>
      </div>
    `;
  };

  renderOauthAlert(oauthStatus);

  const formSections = Array.from(
    contentContainer.querySelectorAll<HTMLElement>('.form-section')
  );

  const googleIcon = `
    <span class="flex-shrink-0 mr-2" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" role="img">
        <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-2 3l3.2 2.5c1.9-1.8 3-4.5 3-7.5 0-.7-.1-1.3-.2-1.9H12z"/>
        <path fill="#34A853" d="M5.3 14.3 4.4 15.7 1.4 17.8C3.4 21.2 7.4 24 12 24c3 0 5.5-1 7.3-2.7l-3.2-2.5c-.9.6-2 1-3.1 1-2.4 0-4.5-1.6-5.2-3.8z"/>
        <path fill="#4A90E2" d="M1.4 6.2C.5 7.9 0 9.9 0 12s.5 4.1 1.4 5.8l3.9-3c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2z"/>
        <path fill="#FBBC05" d="M12 4.8c1.6 0 3 .6 4 1.6l3-3C17.5 1.3 15 0 12 0 7.4 0 3.4 2.8 1.4 6.2l3.9 3.1c.7-2.2 2.8-3.8 5.2-3.8z"/>
      </svg>
    </span>
  `;

  const actionButtons: Array<{
    id: string;
    label: string;
    type: 'form' | 'google';
  }> = [
    { id: 'manual-register-form', label: 'Kayıt Ol', type: 'form' },
    { id: 'manual-login-form', label: 'Giriş Yap', type: 'form' },
    { id: 'google', label: 'Google ile Devam Et', type: 'google' }
  ];

  const setActiveSection = (targetId: string) => {
    const sections = Array.from(
      contentContainer.querySelectorAll<HTMLElement>('.form-section')
    );
    
    sections.forEach((section) => {
      const isActive = section.dataset.section === targetId;
      if (isActive) {
        section.style.display = 'block';
        section.classList.remove('hidden');
      } else {
        section.style.display = 'none';
        section.classList.add('hidden');
      }
    });
  };

  const setActiveButton = (targetId: string) => {
    buttonsContainer
      .querySelectorAll<HTMLButtonElement>('button[data-target]')
      .forEach((button) => {
        const isActive = button.dataset.target === targetId;
        const isGoogle = button.dataset.target === 'google';
        
        if (isGoogle) return; // Google butonu aktif/pasif durumuna göre değişmez
        
        if (isActive) {
          button.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
          button.classList.add('bg-gradient-to-r', 'from-sky-500', 'to-indigo-600', 'text-white');
        } else {
          button.classList.remove('bg-gradient-to-r', 'from-sky-500', 'to-indigo-600', 'text-white', 'shadow-lg', 'shadow-sky-500/50');
          button.classList.add('bg-white/10', 'text-slate-300', 'hover:bg-white/20', 'backdrop-blur-sm', 'border-white/20');
        }
      });
  };

  actionButtons.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.target = action.id;
    
    const baseClasses = 'px-10 py-4 rounded-xl font-bold text-base transition-all duration-300 flex items-center justify-center gap-2 w-full border-2';
    
    if (action.type === 'google') {
      button.className = `${baseClasses} bg-white/95 backdrop-blur-sm text-slate-800 border-white/30 hover:bg-white hover:border-white/50 hover:shadow-lg hover:scale-[1.02] transform`;
      button.innerHTML = `${googleIcon}<span>${action.label}</span>`;
    } else {
      button.className = `${baseClasses} bg-white/10 text-slate-300 hover:bg-white/20 backdrop-blur-sm border-white/20 hover:scale-[1.02] transform`;
      button.innerHTML = `<span>${action.label}</span>`;
    }

    button.addEventListener('click', () => {
      if (action.type === 'google') {
        window.location.href = '/api/users/oauth/google/start';
        return;
      }
      setActiveButton(action.id);
      setActiveSection(action.id);
    });

    buttonsContainer.appendChild(button);
  });

  setActiveButton('manual-register-form');
  setActiveSection('manual-register-form');

  const playSection = document.createElement('section');
  playSection.className = 'hidden max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 lg:mt-24';
  playSection.innerHTML = `
    <div class="rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 p-8 shadow-lg border border-green-200 text-center">
      <div class="mb-6">
        <svg class="w-16 h-16 mx-auto text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <h2 class="text-3xl font-bold text-slate-900 mb-4">Giriş Başarılı!</h2>
      <p class="text-lg text-slate-700 mb-8">
        Artık oyuna bağlanabilirsin. "Play Now" düğmesi seni doğrudan oyun ekranına götürür.
      </p>
      <button type="button" class="w-full px-8 py-4 rounded-lg font-semibold text-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:from-sky-600 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105">
        Play Now
      </button>
    </div>
  `;
  wrapper.appendChild(playSection);

  const playNowButton = playSection.querySelector<HTMLButtonElement>('button');
  if (playNowButton) {
    playNowButton.addEventListener('click', () => {
      location.hash = '/game';
    });
  }

  const toggleAuthLayout = () => {
    const hasSession = Boolean(loadSession());
    if (hasSession) {
      actionsSection.classList.add('hidden');
      playSection.classList.remove('hidden');
    } else {
      actionsSection.classList.remove('hidden');
      playSection.classList.add('hidden');
    }
  };

  const ensureRouteMatchesSession = () => {
    const hasSession = Boolean(loadSession());
    const currentPath = location.hash.replace('#', '');
    if (hasSession && currentPath === '/auth') {
      location.hash = '/dashboard';
    } else if (!hasSession && currentPath !== '/auth') {
      location.hash = '/auth';
    }
  };

  toggleAuthLayout();
  ensureRouteMatchesSession();

  const handleSessionChange = () => {
    toggleAuthLayout();
    ensureRouteMatchesSession();
  };

  const submitConfigs = getSubmitConfigs(handleSessionChange);

  submitConfigs.forEach((config) => {
    const form = wrapper.querySelector<HTMLFormElement>(`#${config.formId}`);
    if (!form) return;

    attachLiveValidation(form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      updateStatus(wrapper, config.formId, 'loading');

      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(config.buildPayload(formData))
        });

        const payload = (await response
          .clone()
          .json()
          .catch(() => undefined)) as Record<string, unknown> | undefined;


        const payloadError =
          payload && typeof payload.error === 'string'
            ? ((payload.message as string) ?? 'İstek başarısız oldu.')
            : null;

        if (payloadError) {
          updateStatus(wrapper, config.formId, 'error', payloadError);
          return;
        }
        if (!response.ok) {
          const fallbackText = await response
            .clone()
            .text()
            .catch(() => 'İstek başarısız oldu.');
          const message =
            (payload?.message as string) ??
            (fallbackText.startsWith('<') ? 'İstek başarısız oldu.' : fallbackText);
          updateStatus(wrapper, config.formId, 'error', message);
          return;
        }

        if (payload) {
          config.onSuccess?.(payload);
          updateStatus(wrapper, config.formId, 'success', config.successMessage(payload));
          setTimeout(() => {
            const status = wrapper.querySelector<HTMLDivElement>(`.status[data-status-for="${config.formId}"]`);
            if (status) {
              status.classList.add('hidden');
              status.style.display = 'none';
            }
          }, 10000);
        } else {
          config.onSuccess?.({});
          updateStatus(wrapper, config.formId, 'success', config.successMessage({}));
          setTimeout(() => {
            const status = wrapper.querySelector<HTMLDivElement>(`.status[data-status-for="${config.formId}"]`);
            if (status) {
              status.classList.add('hidden');
              status.style.display = 'none';
            }
          }, 10000);
        }
        form.reset();
      } catch (error) {
        const fallback =
          error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.';
        updateStatus(wrapper, config.formId, 'error', fallback);
      }
    });
  });

  void syncSessionWithServer(handleSessionChange);

  return wrapper;
};

const attachLiveValidation = (form: HTMLFormElement) => {
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name]'));

  inputs.forEach((input) => {
    const feedbackEl = form.querySelector<HTMLSpanElement>(`[data-feedback-for="${input.name}"]`);
    if (!feedbackEl) return;

    const validate = () => {
      if (input.validity.valid) {
        feedbackEl.textContent = '';
        input.classList.remove('border-red-500', 'ring-red-500');
        input.classList.add('border-slate-300');
        return;
      }

      let message = '';
      if (input.validity.valueMissing) {
        message = 'Bu alan zorunlu.';
      } else if (input.validity.typeMismatch && input.type === 'email') {
        message = 'Lütfen geçerli bir e-posta gir.';
      } else if (input.validity.tooShort) {
        message = `En az ${input.minLength} karakter olmalı.`;
      } else if (input.validity.tooLong) {
        message = `En fazla ${input.maxLength} karakter olabilir.`;
      } else if (input.validity.patternMismatch) {
        message = 'Girdi beklenen formata uymuyor.';
      }

      feedbackEl.textContent = message;
      if (message) {
        input.classList.remove('border-slate-300', 'ring-sky-500');
        input.classList.add('border-red-500', 'ring-red-500');
      }
    };

    input.addEventListener('input', validate);
    input.addEventListener('blur', validate);
  });
};
