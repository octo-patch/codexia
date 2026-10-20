import type { ReasoningEffort } from '@/bindings';

export const MINIMAX_FLASH_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function isMiniMaxFlash(provider: string, model: string | undefined): boolean {
  return (provider === 'minimax' || provider === 'minimax_cn') && model === 'MiniMax-M3.1-Flash';
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
