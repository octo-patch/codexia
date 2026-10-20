import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { codexService } from './codexService';

const { config } = vi.hoisted(() => ({
  config: {
    modelProvider: 'minimax', model: 'MiniMax-M3.1-Flash', reasoningEffort: 'none',
    approvalPolicy: 'never', sandbox: 'read-only', webSearchRequest: false,
    threadCwdMode: 'workspace', collaborationMode: 'plan',
  },
}));
vi.mock('@/components/codex/stores', () => ({
  useConfigStore: { getState: () => config },
  useCodexStore: { getState: () => ({ threads: [], activeThreadIds: [], events: {}, inputFocusTrigger: 0 }), setState: vi.fn() },
  useThreadQueueStore: {}, useThreadReadStateStore: {},
}));
vi.mock('@/stores', () => ({ useWorkspaceStore: { getState: () => ({ cwd: null }) } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: { getState: () => ({}) } }));
vi.mock('@/features/projects/useServerProjectsStore', () => ({
  useServerProjectsStore: { getState: () => ({ status: 'idle' }) },
}));
vi.mock('@/utils/threadHistoryConverter', () => ({ convertThreadHistoryToEvents: vi.fn() }));
vi.mock('@/hooks/runtime', () => ({
  buildUrl: (path: string) => origin + path,
  authHeaders: () => ({ Authorization: 'Bearer local-test-token' }),
  isTauri: () => false, isDesktopTauri: () => false,
}));

let origin = '';
let server: Server;
let providerUrl = 'https://api.minimax.io/v1';
let providerReads = 0;
const requests: { path: string; body: any; auth: string | undefined }[] = [];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/codex/provider/list') {
      providerReads += 1;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ name: config.modelProvider, base_url: providerUrl }]));
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url!, body: JSON.parse(body), auth: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ thread: { id: 'thread-1' }, turn: { id: 'turn-1' }, status: 'applied' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => {
  requests.length = 0;
  providerUrl = 'https://api.minimax.io/v1';
  providerReads = 0;
  config.modelProvider = 'minimax'; config.model = 'MiniMax-M3.1-Flash'; config.reasoningEffort = 'none';
});

describe('MiniMax service requests over the real HTTP adapter', () => {
  it.each(['minimax', 'minimax_cn'])('normalizes Flash thread/turn/live settings for %s', async (provider) => {
    config.modelProvider = provider;
    await codexService.threadStart();
    await codexService.turnStart('thread-1', 'hello');
    await codexService.turnSettingsUpdate('thread-1', 'turn-1', { effort: 'none' });
    expect(requests.map((r) => r.path)).toEqual(['/api/codex/thread/start', '/api/codex/turn/start', '/api/codex/turn/settings/update']);
    expect(requests[0].body).toMatchObject({
      modelProvider: provider, model: 'MiniMax-M3.1-Flash',
      config: { model_reasoning_effort: 'max', collaboration_mode: { settings: { reasoning_effort: 'max' } } },
    });
    expect(requests[1].body).toMatchObject({ model: 'MiniMax-M3.1-Flash', effort: 'max', input: [{ type: 'text', text: 'hello' }] });
    expect(requests[2].body.effort).toBe('max');
    expect(requests.every((r) => r.auth === 'Bearer local-test-token')).toBe(true);
  });

  it.each([
    ['minimax', 'MiniMax-M3.1-Flash', 'https://api.minimax.io/v1'],
    ['minimax_cn', 'MiniMax-M3.1-Flash', 'https://api.minimax.cn/v1/'],
    ['minimax', 'MiniMax-M3', 'https://api.minimax.io/v1'],
  ])('limits tools per thread for official %s/%s', async (provider, model, url) => {
    config.modelProvider = provider; config.model = model; providerUrl = url;
    const saved = { ...config };
    await codexService.threadStart();
    expect(requests[0].body.config).toMatchObject({ web_search: 'disabled', 'features.multi_agent': false });
    expect(config).toEqual(saved);
    expect(providerUrl).toBe(url);
    expect(providerReads).toBe(1);
  });

  it.each([
    ['minimax', 'MiniMax-M3.1-Flash', 'https://gateway.example/v1'],
    ['minimax_cn', 'MiniMax-M3.1-Flash', 'https://api.minimaxi.com/v1'],
    ['minimax', 'MiniMax-M3.1-Flash', 'https://api.minimax.io/custom/v1'],
    ['minimax', 'MiniMax-M3.1-Flash', 'https://api.minimax.io/v1?route=custom'],
    ['minimax', 'MiniMax-M3.1-Flash', 'http://api.minimax.io/v1'],
    ['custom', 'MiniMax-M3.1-Flash', 'https://api.minimax.io/v1'],
    ['minimax', 'MiniMax-M2.7', 'https://api.minimax.io/v1'],
    ['minimax', 'image-01', 'https://api.minimax.io/v1'],
    ['openai', 'gpt-5.5', 'https://api.openai.com/v1'],
  ])('preserves tools for custom, legacy, media or non-MiniMax %s/%s at %s', async (provider, model, url) => {
    config.modelProvider = provider; config.model = model; providerUrl = url;
    await codexService.threadStart();
    expect(requests[0].body.config).not.toHaveProperty('web_search');
    expect(requests[0].body.config).not.toHaveProperty('features.multi_agent');
    expect(requests[0].body.config['features.multi_agents']).toBe(true);
  });

  it('passes explicit legacy thread-resume settings through without a model migration', async () => {
    await codexService.threadResume('thread-1', { modelProvider: 'minimax', model: 'MiniMax-M2.7' });
    expect(requests[0]).toMatchObject({ path: '/api/codex/thread/resume', body: {
      threadId: 'thread-1', modelProvider: 'minimax', model: 'MiniMax-M2.7',
    } });
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('preserves supported Flash effort %s', async (effort) => {
    config.reasoningEffort = effort;
    await codexService.turnStart('thread-1', 'hello');
    expect(requests[0].body.effort).toBe(effort);
  });

  it.each([
    ['minimax', 'MiniMax-M2.7'], ['minimax_cn', 'MiniMax-M3'],
    ['custom', 'MiniMax-M3.1-Flash'], ['openai', 'gpt-5.5'], ['minimax', 'image-01'],
  ])('preserves explicit %s/%s and image inputs', async (provider, model) => {
    config.modelProvider = provider; config.model = model;
    await codexService.turnStart('thread-1', 'hello', ['/workspace/photo.png']);
    expect(requests[0].body).toMatchObject({ model, effort: 'none', input: [
      { type: 'text', text: 'hello' }, { type: 'localImage', path: '/workspace/photo.png' },
    ] });
  });
});
