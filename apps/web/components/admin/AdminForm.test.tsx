import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormField, SaveBar } from './AdminForm';

describe('AdminForm & SaveBar [AFE-02, AFE-32]', () => {
  it('renders FormField with label, required asterisk, and hint', () => {
    render(
      <FormField label="Product Title" required hint="Max 60 characters" error="Title is required">
        <input data-testid="title-input" />
      </FormField>
    );

    expect(screen.getByText('Product Title')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('Max 60 characters')).toBeInTheDocument();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('renders SaveBar when dirty and triggers onSave and onReset', () => {
    const mockSave = vi.fn();
    const mockReset = vi.fn();

    const { rerender } = render(
      <SaveBar isDirty={false} isSaving={false} onSave={mockSave} onReset={mockReset} />
    );

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    rerender(
      <SaveBar isDirty={true} isSaving={false} onSave={mockSave} onReset={mockReset} />
    );

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    const saveBtn = screen.getByText('Save Changes');
    const discardBtn = screen.getByText('Discard');

    fireEvent.click(saveBtn);
    expect(mockSave).toHaveBeenCalled();

    fireEvent.click(discardBtn);
    expect(mockReset).toHaveBeenCalled();
  });
});
