const DEFAULT_API_CANDIDATES = [
  'http://localhost:5000/api/v1',
  'http://localhost:5001/api/v1',
  'http://localhost:5002/api/v1',
  'http://localhost:5003/api/v1',
];

function normalizeBase(value) {
  return String(value || '').replace(/\/$/, '');
}

let resolvedApiBase = null;

export async function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return normalizeBase(import.meta.env.VITE_API_URL);
  }

  if (resolvedApiBase) return resolvedApiBase;

  for (const candidate of DEFAULT_API_CANDIDATES) {
    try {
      const response = await fetch(`${candidate}/health`, { credentials: 'include' });
      if (response.ok) {
        resolvedApiBase = candidate;
        return candidate;
      }
    } catch {
      // Ignore unreachable local API candidates and continue to the next port.
    }
  }

  resolvedApiBase = DEFAULT_API_CANDIDATES[0];
  return resolvedApiBase;
}

export async function apiRequest(path, options = {}) {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Something went wrong.');
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  return payload;
}
