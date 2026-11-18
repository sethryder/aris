import type { GameId } from './types.ts';

export class PobError extends Error {
  override name = 'PobError';
}

/** PoB export code (URL-safe base64 of zlib-deflated XML) → XML Document. */
export async function decodePob(code: string): Promise<{ game: GameId; doc: Document }> {
  let xml: string;
  try {
    const bin = atob(code.trim().replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('deflate'));
    xml = await new Response(stream).text();
  } catch {
    throw new PobError('Not a Path of Building code');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement.nodeName;
  if (root === 'PathOfBuilding') return { game: 'poe1', doc };
  if (root === 'PathOfBuilding2') return { game: 'poe2', doc };
  throw new PobError('Not a Path of Building code');
}
