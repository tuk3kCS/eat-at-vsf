import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { User } from '@vsf/shared';

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly fields: { path: string; message: string }[] = []) {
    super(message);
  }
}
export const sessionKey = ['session'] as const;
export const client = new QueryClient({ defaultOptions: {
  queries: { staleTime: 5000, retry: (count, error) => count < 1 && (!(error instanceof ApiError) || error.status >= 500) },
} });

export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const form = options.body instanceof FormData;
  const response = await fetch('/api/v1' + path, {
    method: options.method, signal: options.signal, credentials: 'same-origin',
    headers: options.body === undefined || form ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : form ? options.body as FormData : JSON.stringify(options.body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
      client.setQueryData(sessionKey, null);
    }
    throw new ApiError(response.status, data?.error?.message ?? 'Không thể kết nối máy chủ. Hãy thử lại.', data?.error?.fields);
  }
  return data as T;
}

export function params(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') query.set(key, String(value));
  return query.size ? '?' + query.toString() : '';
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      try { return await api<User>('/auth/me', { signal }); }
      catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
    },
    staleTime: 30_000, refetchInterval: 60_000,
  });
}

export const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Kết nối bị gián đoạn. Hãy kiểm tra mạng và thử lại.';
export function useAction<T>(
  action: (value: T) => Promise<unknown>, keys: string[], success?: string | ((value: T) => string), done?: (value: T) => void,
) {
  const query = useQueryClient();
  const refresh = () => Promise.all(keys.map(key => query.invalidateQueries({ queryKey: [key] })));
  return useMutation({
    mutationFn: action,
    onSuccess: async (_, value) => {
      await refresh();
      const message = typeof success === 'function' ? success(value) : success;
      if (message) toast.success(message);
      done?.(value);
    },
    onError: async error => { toast.error(errorMessage(error)); if (error instanceof ApiError && error.status === 409) await refresh(); },
  });
}
