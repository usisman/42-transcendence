import { createAuthPanel } from '../components/auth-panel';

export const renderAuthView = (container: HTMLElement) => {
  const panel = createAuthPanel();
  container.appendChild(panel);
};
