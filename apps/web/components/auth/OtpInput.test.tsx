import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { OtpInput } from './OtpInput';

function OtpInputWrapper({ onComplete }: { onComplete?: (otp: string) => void }) {
  const [val, setVal] = useState('');
  return <OtpInput value={val} onChange={setVal} onComplete={onComplete} autoFocus={false} />;
}

describe('OtpInput Component', () => {
  it('renders 6 input boxes with accessible labels', () => {
    render(<OtpInputWrapper />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
    expect(inputs[0]).toHaveAttribute('aria-label', 'Digit 1 of 6');
    expect(inputs[5]).toHaveAttribute('aria-label', 'Digit 6 of 6');
  });

  it('updates input value on digit entry and calls onComplete when all 6 are typed', () => {
    const handleComplete = vi.fn();
    render(<OtpInputWrapper onComplete={handleComplete} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

    // Type 1, 2, 3, 4, 5, 6 sequentially
    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '2' } });
    fireEvent.change(inputs[2], { target: { value: '3' } });
    fireEvent.change(inputs[3], { target: { value: '4' } });
    fireEvent.change(inputs[4], { target: { value: '5' } });
    fireEvent.change(inputs[5], { target: { value: '6' } });

    expect(handleComplete).toHaveBeenCalledWith('123456');
  });

  it('handles paste of 6-digit code', () => {
    const handleComplete = vi.fn();
    render(<OtpInputWrapper onComplete={handleComplete} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];

    fireEvent.paste(inputs[0], {
      clipboardData: {
        getData: () => '789012',
      },
    });

    expect(handleComplete).toHaveBeenCalledWith('789012');
  });
});
