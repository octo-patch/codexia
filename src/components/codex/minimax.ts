import type { ReasoningEffort } from '@/bindings';

export const MINIMAX_FLASH_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function isMiniMaxFlash(provider: string, model: string | undefined): boolean {
  return (provider === 'minimax' || provider === 'minimax_cn') && model === 'MiniMax-M3.1-Flash';
}

export function isMiniMaxTextPreset(provider: string, model: string | undefined): boolean {
  return (
    (provider === 'minimax' || provider === 'minimax_cn') &&
    (model === 'MiniMax-M3.1-Flash' || model === 'MiniMax-M3')
  );
}

// Scope capability restrictions to documented official Responses endpoints.
// Custom routes and the unverified legacy CN alias keep their existing behavior.
export function miniMaxToolConfig(baseUrl: string | null | undefined) {
  if (!baseUrl) return {};
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol === 'https:' &&
      (url.hostname === 'api.minimax.io' || url.hostname === 'api.minimax.cn') &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '/v1' || url.pathname === '/v1/')
    ) {
      return { web_search: 'disabled', 'features.multi_agent': false };
    }
  } catch {
    // Let the existing provider validation handle an invalid custom URL.
  }
  return {};
}

// Flash always reasons. Do not forward a disabled or unsupported effort inherited
// from another model; preserve valid choices and leave custom providers untouched.
export function miniMaxReasoningEffort(
  provider: string,
  model: string | undefined,
  effort: ReasoningEffort | undefined
): ReasoningEffort | undefined {
  if (isMiniMaxFlash(provider, model) && !MINIMAX_FLASH_EFFORTS.includes(effort ?? '')) {
    return 'max';
  }
  return effort;
}
