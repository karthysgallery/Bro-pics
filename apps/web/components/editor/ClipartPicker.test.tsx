import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClipartOption } from '@bro-pics/shared';
import { ClipartPicker } from './ClipartPicker';

const options: ClipartOption[] = [
  { id: 'heart', label: 'Heart', assetUrl: '/clipart/heart.svg', x: 0.8, y: 0.05, width: 0.1, height: 0.1 },
  { id: 'star', label: 'Star', assetUrl: '/clipart/star.svg', x: 0.8, y: 0.2, width: 0.1, height: 0.1 },
];

describe('ClipartPicker', () => {
  it('renders nothing when there are no options', () => {
    const { container } = render(<ClipartPicker options={[]} selectedId={null} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a caption for each option', () => {
    render(<ClipartPicker options={options} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Heart')).toBeInTheDocument();
    expect(screen.getByText('Star')).toBeInTheDocument();
  });

  it('marks the selected option', () => {
    render(<ClipartPicker options={options} selectedId="star" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Star' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect with the id when an unselected option is clicked', () => {
    const onSelect = vi.fn();
    render(<ClipartPicker options={options} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(onSelect).toHaveBeenCalledWith('heart');
  });

  it('calls onSelect with null when the already-selected option is clicked again', () => {
    const onSelect = vi.fn();
    render(<ClipartPicker options={options} selectedId="heart" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
