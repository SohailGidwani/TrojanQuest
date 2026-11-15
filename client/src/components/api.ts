export class RequestError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export async function requestJSON<T>(path: string, options: { body?: unknown; accessToken?: string; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.body === undefined ? 'GET' : 'POST', signal: options.signal,
    headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) throw new RequestError(response.status, 'This feature is not connected yet.')
  const data = await response.json()
  if (!response.ok) throw new RequestError(response.status, typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.')
  return data as T
}
