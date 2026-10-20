import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nextReasoningEffort, ReasoningEffortSelector } from './ReasoningEffortSelector';

describe('Flash reasoning choices', () => {
  it.each(['minimax', 'minimax_cn'])('supports max and prevents disabled reasoning for %s', (provider) => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ReasoningEffortSelector provider={provider} modelId="MiniMax-M3.1-Flash" value="max" onChange={onChange} />
    );
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('max');
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('xhigh');
    onChange.mockClear();
    rerender(<ReasoningEffortSelector provider={provider} modelId="MiniMax-M3.1-Flash" value="low" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
    expect(nextReasoningEffort(provider, 'MiniMax-M3.1-Flash', 'none', [])).toBe('max');
    expect(nextReasoningEffort(provider, 'MiniMax-M3.1-Flash', undefined, [])).toBe('max');
    expect(nextReasoningEffort(provider, 'MiniMax-M3.1-Flash', 'max', [])).toBeUndefined();
  });

  it('retains disabled reasoning for an explicit custom provider', () => {
    render(<ReasoningEffortSelector provider="custom" modelId="MiniMax-M3.1-Flash" value="none" onChange={vi.fn()} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toBe('none');
    expect(nextReasoningEffort('custom', 'MiniMax-M3.1-Flash', 'none', [])).toBeUndefined();
  });
});
