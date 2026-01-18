const styleContent = `
  :root {
    color-scheme: light dark;
    font-family: "Inter", system-ui, sans-serif;
    background: radial-gradient(circle at top left, #1d8cf8 0%, transparent 55%), var(--bg, #f5f7fb);
    min-height: 100vh;
  }

  body {
    margin: 0;
  }

  .app {
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    color: #0f172a;
  }

  .app__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 32px;
  }

  .app__header h1 {
    margin: 0;
    font-size: 2.4rem;
  }

  .app__header p {
    margin: 4px 0 0;
    color: #334155;
  }

  .app__hint {
    margin: 0;
    font-size: 0.9rem;
    color: #64748b;
  }

  .session-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    background: rgba(15, 23, 42, 0.06);
    border-radius: 12px;
    padding: 8px 14px;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .session-banner p {
    margin: 0;
    font-size: 0.9rem;
    color: #1e293b;
  }

  .session-banner__actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .session-banner--empty {
    background: rgba(148, 163, 184, 0.1);
    border-style: dashed;
    color: #475569;
    font-weight: 600;
  }

  .is-hidden {
    display: none !important;
  }

  .auth-stack {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 24px;
    margin: 32px auto 0;
    max-width: 960px;
  }

  .auth-stack__buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1 1 220px;
    max-width: 280px;
  }

  .auth-stack__content {
    flex: 2 1 360px;
    min-width: 280px;
    max-width: 420px;
    display: flex;
    flex-direction: column;
  }

  .card {
    background: rgba(255, 255, 255, 0.82);
    border-radius: 16px;
    padding: 22px 24px;
    box-shadow: 0 18px 35px -20px rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .card h2 {
    margin: 0 0 16px;
    font-size: 1.2rem;
    color: #0f172a;
  }

  .card--cta {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .card--cta p {
    margin: 0;
    color: #334155;
  }

  .form-section {
    display: none;
    padding: 26px 28px;
    border-radius: 18px;
    box-shadow: 0 20px 45px -30px rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(148, 163, 184, 0.18);
    animation: fade-in 0.2s ease;
  }

  .form-section.is-active {
    display: block;
  }

  .form-section h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.95rem;
    color: #1e293b;
  }

  .form__field input {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.45);
    padding: 10px 12px;
    font-size: 0.95rem;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .form__field input:focus {
    outline: none;
    border-color: #1d8cf8;
    box-shadow: 0 0 0 3px rgba(29, 140, 248, 0.2);
  }

  .form__feedback {
    min-height: 16px;
    font-size: 0.8rem;
    color: #1e293b;
  }

  .form__feedback--error {
    color: #e11d48;
  }

  .button {
    background: linear-gradient(135deg, #1d8cf8, #845ef7);
    color: white;
    border: none;
    border-radius: 999px;
    padding: 10px 18px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .button:hover {
    box-shadow: 0 8px 18px -10px rgba(29, 140, 248, 0.75);
    transform: translateY(-1px);
  }

  .button:active {
    transform: translateY(0);
  }

  .button--secondary {
    background: transparent;
    color: #1d8cf8;
    border: 1px solid rgba(29, 140, 248, 0.4);
    box-shadow: none;
  }

  .button--secondary:hover {
    background: rgba(29, 140, 248, 0.08);
    box-shadow: none;
  }

  .status {
    min-height: 24px;
    margin-top: 16px;
    font-size: 0.9rem;
    word-break: break-word;
  }

  .status--success {
    color: #0f9d58;
  }

  .status--error {
    color: #e11d48;
  }

  code {
    background: rgba(15, 23, 42, 0.06);
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 0.9em;
  }

  .game__canvas-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
    padding: 24px 0 64px;
  }

  .game__canvas-wrapper canvas {
    max-width: min(90vw, 960px);
    border-radius: 12px;
    box-shadow: 0 18px 35px -20px rgba(15, 23, 42, 0.5);
  }

  .game__score {
    position: absolute;
    top: 24px;
    right: clamp(16px, 8vw, 64px);
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(15, 23, 42, 0.75);
    color: #f8fafc;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
  }

  .game__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: flex-end;
    font-size: 0.95rem;
    color: #1e293b;
  }

  .game__keys {
    text-align: right;
  }

  .card--cta button,
  .game__status button {
    min-width: 160px;
  }

  .dashboard__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-top: 32px;
  }

  .dashboard__actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .dashboard__eyebrow {
    margin: 0;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    color: #94a3b8;
  }

  .dashboard__header h1 {
    margin: 4px 0;
  }

  .dashboard__muted {
    margin: 0;
    color: #64748b;
  }

  .dashboard__card {
    margin-top: 24px;
    padding: 24px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 25px 55px -40px rgba(15, 23, 42, 0.8);
  }

  .dashboard__card h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
  }

  .dashboard__card--placeholder {
    background: rgba(15, 23, 42, 0.04);
    border-style: dashed;
    color: #475569;
  }

  .dashboard__list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin: 0;
  }

  .dashboard__list dt {
    font-size: 0.8rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 4px;
  }

  .dashboard__list dd {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: #0f172a;
  }

  .dashboard__nickname {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .icon-button {
    border: none;
    background: rgba(148, 163, 184, 0.2);
    border-radius: 999px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .icon-button:hover {
    background: rgba(148, 163, 184, 0.35);
  }

  .dashboard__nickname-form {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dashboard__nickname-form input {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.4);
  }

  .dashboard__nickname-actions {
    display: flex;
    gap: 8px;
  }

  .button--small {
    padding: 8px 14px;
    font-size: 0.85rem;
  }

  .tournament__header {
    margin-top: 32px;
    margin-bottom: 16px;
  }

  .tournament__tabs {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }

  .tournament__content {
    display: block;
  }

  .tournament__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 420px;
  }

  .tournament__form label span {
    display: block;
    font-size: 0.9rem;
    margin-bottom: 4px;
    color: #475569;
  }

  .tournament__form input,
  .tournament__form select {
    width: 100%;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.4);
  }

  .tournament-card {
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 16px;
    background: rgba(255, 255, 255, 0.9);
  }

  .tournament-card.is-active {
    border-color: rgba(52, 211, 153, 0.6);
  }

  .tournament-card header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .tournament-card__status {
    margin: 0;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: #94a3b8;
  }

  .tournament-card__meta {
    margin: 0;
    color: #64748b;
  }

  .tournament-card__badge {
    font-weight: 700;
    font-size: 1.2rem;
    color: #0f172a;
  }

  .tournament-card__body {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tournament-card__join {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .tournament-card__join input {
    flex: 1;
    min-width: 200px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.4);
  }

  .bracket {
    display: grid;
    gap: 12px;
  }

  .bracket__match {
    border: 1px dashed rgba(148, 163, 184, 0.5);
    padding: 12px;
    border-radius: 12px;
  }

  .alert {
    margin: 0 0 24px;
    padding: 12px 16px;
    border-radius: 12px;
    font-weight: 600;
  }

  .alert--success {
    background: rgba(16, 185, 129, 0.15);
    color: #047857;
  }

  .alert--error {
    background: rgba(248, 113, 113, 0.2);
    color: #b91c1c;
  }

  .tab-button {
    border: 1px solid rgba(15, 23, 42, 0.15);
    background: rgba(15, 23, 42, 0.02);
    color: #0f172a;
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 1rem;
    font-weight: 600;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .tab-button span {
    pointer-events: none;
  }

  .tab-button.is-active {
    border-color: rgba(29, 140, 248, 0.6);
    background: rgba(29, 140, 248, 0.12);
    box-shadow: 0 10px 25px -18px rgba(15, 23, 42, 0.7);
  }

  .tab-button--google {
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.12);
  }

  .tab-button__icon {
    display: inline-flex;
    width: 24px;
    height: 24px;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .game__status {
    margin-top: -32px;
    margin-bottom: 24px;
    padding: 16px;
    background: rgba(15, 23, 42, 0.06);
    border-radius: 12px;
    color: #0f172a;
    text-align: center;
    font-weight: 600;
  }
`;

let styleElement: HTMLStyleElement | null = null;

export const createStyles = () => {
  if (styleElement) return;

  styleElement = document.createElement('style');
  styleElement.textContent = styleContent;
  document.head.appendChild(styleElement);
};
