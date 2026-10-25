export class IntegrationError extends Error {}

export function serviceUrl(name: string, value: string | undefined): string {
  try {
    const url = new URL(value ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new IntegrationError(`Set a valid ${name}_URL on the server.`);
  }
}

export async function serviceJson<T>(name: string, url: string, headers: HeadersInit, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init, headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new IntegrationError(`${name} could not be reached. Check the server connection and retry.`);
  }
  if (!response.ok) {
    // Upstream bodies and URLs can contain credentials. Return only a safe status.
    throw new IntegrationError(`${name} returned HTTP ${response.status}. Check its API key, root folder and quality profile.`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new IntegrationError(`${name} returned an invalid response.`);
  }
}
