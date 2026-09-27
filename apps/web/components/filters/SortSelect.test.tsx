import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortSelect } from './SortSelect';

describe('SortSelect', () => {
  it('[FE-30] defaults to Relevance when no sort is given', () => {
    render(<SortSelect value={undefined} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Sort by')).toHaveValue('relevance');
  });

  it('[FE-30] calls onChange with the selected sort value', () => {
    const onChange = vi.fn();
    render(<SortSelect value="relevance" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'top_rated' } });
    expect(onChange).toHaveBeenCalledWith('top_rated');
  });
});
