import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from './DataTable';
import { StatusChip } from './StatusChip';

describe('StatusChip [AFE-02]', () => {
  it('renders correct labels and styling for order, production, and return states', () => {
    const { rerender } = render(<StatusChip status="paid" />);
    expect(screen.getByText('Paid')).toBeInTheDocument();

    rerender(<StatusChip status="in_production" />);
    expect(screen.getByText('In Production')).toBeInTheDocument();

    rerender(<StatusChip status="refunded" />);
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });
});

describe('DataTable [AFE-02]', () => {
  const sampleData = [
    { id: '1', name: 'Classic Oak Frame', price: 99900, status: 'in_stock' },
    { id: '2', name: 'Minimalist Black Frame', price: 149900, status: 'out_of_stock' },
  ];

  const columns = [
    { key: 'name', header: 'Product Name', sortable: true },
    { key: 'price', header: 'Price', render: (row: any) => `₹${row.price / 100}` },
    { key: 'status', header: 'Stock', render: (row: any) => <StatusChip status={row.status} /> },
  ];

  it('renders table headers and rows accurately', () => {
    render(<DataTable data={sampleData} columns={columns} keyExtractor={(r) => r.id} />);

    expect(screen.getByText('Product Name')).toBeInTheDocument();
    expect(screen.getByText('Classic Oak Frame')).toBeInTheDocument();
    expect(screen.getByText('Minimalist Black Frame')).toBeInTheDocument();
    expect(screen.getByText('₹999')).toBeInTheDocument();
  });

  it('supports row selection and triggers bulk actions', () => {
    const mockBulkAction = vi.fn();
    render(
      <DataTable
        data={sampleData}
        columns={columns}
        keyExtractor={(r) => r.id}
        selectable
        bulkActions={[{ label: 'Publish All', onClick: mockBulkAction }]}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // Select first row
    fireEvent.click(checkboxes[1]);

    const publishBtn = screen.getByText('Publish All');
    expect(publishBtn).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(publishBtn);
    expect(mockBulkAction).toHaveBeenCalledWith([sampleData[0]]);
  });
});
