import { setTimeout } from "node:timers/promises";

/** Only the public release fixture requests: never retry installation or integrity assertions. */
export async function fetchPublicRelease(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, init);
    console.log(`Public release GET ${url}: HTTP ${response.status} (attempt ${attempt + 1}/3)`);
    if (response.status !== 504 || attempt === 2) return response;
    await response.body?.cancel();
    await setTimeout(1000 * (attempt + 1));
  }
}
