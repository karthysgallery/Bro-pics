import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextFieldEditor, type TextFieldValue } from './TextFieldEditor';

const baseField: TextFieldValue = { value: '', fontKey: 'dancing-script', color: '#2b2420' };

describe('TextFieldEditor [FE-12]', () => {
  it('shows a required marker and hint when required and empty, neither when not required', () => {
    const { rerender } = render(<TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} required />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name *')).toBeInTheDocument();

    rerender(<TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} />);
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('does not show the required hint once a value is entered', () => {
    render(<TextFieldEditor fieldKey="name" label="Name" field={{ ...baseField, value: 'Amit' }} onChange={vi.fn()} required />);
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('restricts the font picker to allowedFontKeys when given', () => {
    render(
      <TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} allowedFontKeys={['pacifico', 'cinzel']} />
    );
    const group = screen.getByRole('group', { name: 'Name font' });
    expect(group.children).toHaveLength(2);
  });

  it('offers every font when allowedFontKeys is absent', () => {
    render(<TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Name font' });
    expect(group.children.length).toBeGreaterThan(2);
  });

  it('restricts the colour picker to allowedColorValues and hides the custom colour input', () => {
    render(
      <TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} allowedColorValues={['#2b2420']} />
    );
    expect(screen.queryByLabelText('Name custom colour')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Charcoal/ })).toHaveLength(1);
  });

  it('shows the native colour input when allowedColorValues is absent', () => {
    render(<TextFieldEditor fieldKey="name" label="Name" field={baseField} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Name custom colour')).toBeInTheDocument();
  });
});
