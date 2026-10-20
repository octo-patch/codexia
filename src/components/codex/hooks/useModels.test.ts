import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import catalog from '../../../../crates/codex/src/llms.json';
import { useModels } from './useModels';

const saved = [
  { id: 'MiniMax-M2.7', name: 'My legacy model' },
  { id: 'private-model', name: 'Custom deployment' },
];
vi.mock('@/services/apiAdapt', () => ({
  listModels: async () => ({ data: [] }),
  listProviderPresets: async () => catalog.data,
  listConfigProviders: async () => [{ name: 'minimax' }, { name: 'minimax_cn' }],
  listOtherModels: async () => [],
}));
vi.mock('@/stores/settings', () => ({
  useModelSettingsStore: (select: (state: unknown) => unknown) => select({
    models: { minimax: saved, minimax_cn: saved }, load: vi.fn(),
  }),
}));

describe('MiniMax catalog suggestions', () => {
  it.each(['minimax', 'minimax_cn'])('offers Flash then M3 while preserving saved models for %s', async (provider) => {
    const { result } = renderHook(() => useModels());
    await waitFor(() => expect(result.current.providerSuggestions(provider)).toHaveLength(2));
    expect(result.current.providerSuggestions(provider).map((m) => m.id)).toEqual([
      'MiniMax-M3.1-Flash', 'MiniMax-M3',
    ]);
    expect(result.current.providerItems(provider)).toEqual(saved.map((m) => ({ id: m.id, label: m.name })));
    const preset = catalog.data.find((p) => p.model_provider === provider)!;
    expect(preset.base_url).toBe(provider === 'minimax' ? 'https://api.minimax.io/v1' : 'https://api.minimaxi.com/v1');
    expect(preset.env_key).toBe('MINIMAX_API_KEY');
    expect(preset.models?.map((m) => m.context_length)).toEqual([1000000, 1000000]);
  });
});
