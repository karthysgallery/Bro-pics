import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminModal, ConfirmModal } from './AdminModal';

describe('AdminModal & ConfirmModal [AFE-02, AFE-32]', () => {
  it('renders AdminModal when open and fires onClose on close button or backdrop', () => {
    const mockClose = vi.fn();
    render(
      <AdminModal
        isOpen={true}
        onClose={mockClose}
        title="Edit Item"
        description="Configure properties"
      >
        <p>Modal Body Content</p>
      </AdminModal>
    );

    expect(screen.getByText('Edit Item')).toBeInTheDocument();
    expect(screen.getByText('Configure properties')).toBeInTheDocument();
    expect(screen.getByText('Modal Body Content')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close dialog/i });
    fireEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalled();
  });

  it('renders ConfirmModal with danger styling and executes confirmation', () => {
    const mockConfirm = vi.fn();
    const mockClose = vi.fn();

    render(
      <ConfirmModal
        isOpen={true}
        onClose={mockClose}
        onConfirm={mockConfirm}
        title="Delete Resource"
        message="Are you sure you want to proceed?"
        confirmText="Yes, Delete"
        variant="danger"
      />
    );

    expect(screen.getByText('Delete Resource')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();

    const confirmBtn = screen.getByText('Yes, Delete');
    expect(confirmBtn).toHaveClass('bg-red-600');

    fireEvent.click(confirmBtn);
    expect(mockConfirm).toHaveBeenCalled();
  });
});
