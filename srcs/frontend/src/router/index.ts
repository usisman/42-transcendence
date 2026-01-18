export type RouteConfig = {
  path: string;
  render: (container: HTMLElement) => void | (() => void);
};

export class Router {
  private routes = new Map<string, (container: HTMLElement) => void | (() => void)>();
  private target: HTMLElement;
  private currentCleanup?: () => void;

  constructor(target: HTMLElement) {
    this.target = target;
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  register(config: RouteConfig) {
    this.routes.set(config.path, config.render);
  }

  init() {
    if (!location.hash) {
      this.navigate('/auth', { replace: true });
      return;
    }

    this.handleRoute();
  }

  navigate(path: string, options?: { replace?: boolean }) {
    if (options?.replace) {
      history.replaceState(null, '', `#${path}`);
      this.handleRoute();
    } else {
      location.hash = path;
    }
  }

  private handleRoute() {
    const hash = location.hash.replace(/^#/, '') || '/auth';
    const [path] = hash.split('?');
    const normalizedPath = path || '/auth';
    const render = this.routes.get(normalizedPath);

    if (render) {
      if (this.currentCleanup) {
        this.currentCleanup();
        this.currentCleanup = undefined;
      }

      this.target.innerHTML = '';
      const cleanup = render(this.target);
      if (typeof cleanup === 'function') {
        this.currentCleanup = cleanup;
      }
    }
  }
}
