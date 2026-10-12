import { handleAssistant } from '../server/assistant.mjs';
import { handleLibrary } from '../server/library.mjs';
import { handleGenerations } from '../server/generations.mjs';
import { handleReleases } from '../server/releases.mjs';
import { handleCovers } from '../server/covers.mjs';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/assistant') return handleAssistant(request, env);
    if (path.startsWith('/api/generations')) return handleGenerations(request, env);
    if (path.startsWith('/api/releases')) return handleReleases(request, env);
    if (path.startsWith('/api/covers')) return handleCovers(request, env);
    if (path.startsWith('/api/account') || path.startsWith('/api/state/') || path.startsWith('/api/assets')) return handleLibrary(request, env);
    if (path.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    return env.ASSETS.fetch(request);
  }
};
