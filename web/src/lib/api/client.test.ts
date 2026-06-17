import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from './client';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('uses same-origin frontend api routes for relative paths', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as Response);

    await apiFetch('/api/projects', 'alpha');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/projects');
    expect(new Headers(init?.headers).get('X-Session-Id')).toBe('alpha');
  });

  it('preserves absolute urls when provided explicitly', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [] }),
    } as unknown as Response);

    await apiFetch('http://127.0.0.1:8000/health');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/health');
  });
});
