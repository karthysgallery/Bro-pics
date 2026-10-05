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

describe('FormField accessibility', () => {
  it('associates the label with a native input so it is announced and clickable', () => {
    render(
      <FormField label="Selling Price (₹)" required>
        <input type="number" />
      </FormField>
    );
    const input = screen.getByLabelText(/Selling Price/);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('works for select and textarea too', () => {
    render(
      <>
        <FormField label="Reason">
          <select>
            <option>A</option>
          </select>
        </FormField>
        <FormField label="Notes">
          <textarea />
        </FormField>
      </>
    );
    expect(screen.getByLabelText('Reason')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('keeps an id the caller already set and uses it for the label', () => {
    render(
      <FormField label="SKU">
        <input id="sku-field" />
      </FormField>
    );
    expect(screen.getByLabelText('SKU')).toHaveAttribute('id', 'sku-field');
  });

  it('marks the control invalid and links the error message', () => {
    render(
      <FormField label="Name" error="Name is required">
        <input />
      </FormField>
    );
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Name is required');
    expect(input.getAttribute('aria-describedby')).toBe(message.id);
  });

  it('links the hint when there is no error', () => {
    render(
      <FormField label="Slug" hint="Used in the URL">
        <input />
      </FormField>
    );
    const input = screen.getByLabelText('Slug');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent('Used in the URL');
  });

  it('does not touch custom component children', () => {
    const Custom = () => <div data-testid="custom">custom control</div>;
    render(
      <FormField label="Picker">
        <Custom />
      </FormField>
    );
    expect(screen.getByTestId('custom')).not.toHaveAttribute('id');
  });
});
