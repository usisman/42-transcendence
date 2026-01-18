#!/usr/bin/env tsx


process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const baseUrl = process.env.AUTH_TEST_BASE_URL ?? 'https://localhost:8443';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FetchInit = Exclude<Parameters<typeof fetch>[1], undefined>;
type FetchBody = FetchInit extends { body?: infer B } ? B : never;

type ResponseWithData<T> = Response & { data: T | undefined };

const isBodyInit = (value: unknown): value is FetchBody => {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream ||
    typeof value === 'string'
  );
};

type JsonRequestInit = Omit<FetchInit, 'body'> & { body?: unknown };

class HttpClient {
  private readonly cookieJar = new Map<string, string>();

  constructor(private readonly base: string) {}

  private buildCookieHeader() {
    if (this.cookieJar.size === 0) {
      return undefined;
    }
    return Array.from(this.cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private storeCookies(setCookies: string[] = []) {
    setCookies.forEach((cookieStr) => {
      const [pair] = cookieStr.split(';');
      if (!pair) return;
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) return;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (name) {
        this.cookieJar.set(name, value);
      }
    });
  }

  async request<T = unknown>(path: string, init: JsonRequestInit = {}): Promise<ResponseWithData<T>> {
    const url = `${this.base}${path}`;
    const { body: rawBody, headers: initHeaders, ...rest } = init;
    const headers = new Headers(initHeaders);
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }

    let body: FetchBody | undefined;
    if (rawBody !== undefined) {
      if (isBodyInit(rawBody)) {
        body = rawBody;
      } else {
        headers.set('content-type', headers.get('content-type') ?? 'application/json');
        body = JSON.stringify(rawBody) as FetchBody;
      }
    }

    const response = await fetch(url, {
      ...rest,
      headers,
      body
    });

    const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(response.headers) : [];
    this.storeCookies(setCookies);

    const data = (await response
      .clone()
      .json()
      .catch(() => undefined)) as T | undefined;

    return Object.assign(response, { data });
  }
}

async function waitForServer(client: HttpClient, retries = 30) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await client.request('/');
      if (response.ok || response.status === 401 || response.status === 404) {
        return;
      }
    } catch (error) {
      if (attempt === retries - 1) throw error;
    }
    await sleep(1000);
  }
  throw new Error('Sunucuya ulaşılamadı.');
}

async function main() {
  const client = new HttpClient(baseUrl);
  await waitForServer(client);

  const suffix = Date.now();
  const email = `ci-${suffix}@example.dev`;
  const password = 'Password123!';
  const nickname = `user-${suffix}`;

  const registerResponse = await client.request('/api/users/register', {
    method: 'POST',
    body: { email, password, nickname }
  });

  if (registerResponse.status !== 201) {
    throw new Error(`Kayıt başarısız: status=${registerResponse.status}, body=${registerResponse.data ? JSON.stringify(registerResponse.data) : '—'}`);
  }

  const loginResponse = await client.request<{ id: number }>('/api/users/login', {
    method: 'POST',
    body: { email, password }
  });

  if (loginResponse.status !== 200) {
    throw new Error(`Login başarısız: status=${loginResponse.status}, body=${loginResponse.data ? JSON.stringify(loginResponse.data) : '—'}`);
  }

  const meResponse = await client.request('/api/users/me');
  if (meResponse.status !== 200) {
    throw new Error(`Me isteği başarısız: status=${meResponse.status}, body=${meResponse.data ? JSON.stringify(meResponse.data) : '—'}`);
  }

  const refreshResponse = await client.request('/api/users/refresh', {
    method: 'POST'
  });
  if (refreshResponse.status !== 200) {
    throw new Error(`Refresh başarısız: status=${refreshResponse.status}, body=${refreshResponse.data ? JSON.stringify(refreshResponse.data) : '—'}`);
  }

  const logoutResponse = await client.request('/api/users/logout', {
    method: 'POST'
  });
  if (logoutResponse.status !== 204) {
    throw new Error(`Logout başarısız: status=${logoutResponse.status}, body=${logoutResponse.data ? JSON.stringify(logoutResponse.data) : '—'}`);
  }

  const meAfterLogout = await client.request('/api/users/me');
  if (meAfterLogout.status !== 401) {
    throw new Error(`Logout sonrasında me isteği 401 dönmedi: status=${meAfterLogout.status}`);
  }

  console.log('✅ Auth akışı testi başarıyla tamamlandı.');
}

main().catch((error) => {
  console.error('❌ Auth akışı testi başarısız:', error);
  process.exit(1);
});
