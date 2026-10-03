'use client';

import { useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
}

export interface BulkAction<T> {
  label: string;
  variant?: 'default' | 'danger';
  onClick: (selectedRows: T[]) => void | Promise<void>;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  // Bulk Actions
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  // Pagination
  currentPage?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSortChange?: (column: string, direction: 'asc' | 'desc') => void;
  // CSV Export
  exportFilename?: string;
  headerActions?: ReactNode;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyMessage = 'No records found.',
  searchPlaceholder = 'Search records...',
  searchValue,
  onSearchChange,
  selectable = false,
  bulkActions = [],
  currentPage = 1,
  pageSize = 10,
  totalCount,
  onPageChange,
  sortColumn,
  sortDirection,
  onSortChange,
  exportFilename = 'export.csv',
  headerActions,
  className = '',
}: DataTableProps<T>) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [localSearch, setLocalSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(columns.map((c) => c.key)));
  const [showColMenu, setShowColMenu] = useState(false);

  const effectiveSearch = searchValue !== undefined ? searchValue : localSearch;

  // Selection handlers
  const allKeysOnPage = data.map(keyExtractor);
  const isAllSelected = allKeysOnPage.length > 0 && allKeysOnPage.every((k) => selectedKeys.has(k));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        allKeysOnPage.forEach((k) => next.delete(k));
        return next;
      });
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        allKeysOnPage.forEach((k) => next.add(k));
        return next;
      });
    }
  };

  const toggleSelectRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRows = data.filter((row) => selectedKeys.has(keyExtractor(row)));

  // Sorting
  const handleSort = (colKey: string) => {
    if (!onSortChange) return;
    if (sortColumn === colKey) {
      onSortChange(colKey, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(colKey, 'asc');
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const activeCols = columns.filter((c) => visibleColumns.has(c.key));
    const headerRow = activeCols.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const rows = data.map((row) => {
      return activeCols
        .map((c) => {
          const val = row[c.key];
          const str = val === undefined || val === null ? '' : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headerRow, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', exportFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = totalCount ? Math.ceil(totalCount / pageSize) : undefined;
  const filteredColumns = columns.filter((c) => visibleColumns.has(c.key));

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-3 flex items-center text-ink/40 pointer-events-none text-xs">
              🔍
            </span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={effectiveSearch}
              onChange={(e) => {
                if (onSearchChange) onSearchChange(e.target.value);
                else setLocalSearch(e.target.value);
              }}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-line bg-paper text-ink placeholder:text-ink/40 focus:outline-none focus:border-gold"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {headerActions}

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColMenu((v) => !v)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-line bg-paper text-ink hover:bg-tint transition-colors flex items-center gap-1.5"
            >
              <span>Columns</span>
              <span className="text-2xs text-ink/50">▼</span>
            </button>
            {showColMenu && (
              <div className="absolute right-0 mt-1 z-30 w-48 rounded-xl border border-line bg-paper p-2 shadow-xl flex flex-col gap-1 text-xs">
                {columns.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1 hover:bg-tint rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(c.key)}
                      onChange={(e) => {
                        const next = new Set(visibleColumns);
                        if (e.target.checked) next.add(c.key);
                        else if (next.size > 1) next.delete(c.key);
                        setVisibleColumns(next);
                      }}
                      className="rounded text-gold focus:ring-gold"
                    />
                    <span className="truncate">{c.header}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-line bg-paper text-ink hover:bg-tint disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectable && selectedRows.length > 0 && bulkActions.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-ink text-paper text-xs shadow-md animate-fade-in">
          <span className="font-semibold text-gold">{selectedRows.length} selected</span>
          <span className="h-4 w-px bg-paper/20" />
          <div className="flex items-center gap-2">
            {bulkActions.map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={() => action.onClick(selectedRows)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  action.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-paper/10 hover:bg-paper/20 text-paper'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="rounded-2xl border border-line bg-paper overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-field border-b border-line text-ink/70 font-semibold sticky top-0 z-10">
              <tr>
                {selectable && (
                  <th className="p-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded text-gold focus:ring-gold"
                    />
                  </th>
                )}
                {filteredColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`p-3.5 whitespace-nowrap ${
                      col.sortable ? 'cursor-pointer select-none hover:text-ink' : ''
                    } ${col.className || ''}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {col.sortable && sortColumn === col.key && (
                        <span className="text-gold font-bold text-2xs">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {selectable && <td className="p-3.5"><div className="w-4 h-4 bg-tint rounded" /></td>}
                    {filteredColumns.map((col) => (
                      <td key={col.key} className="p-3.5">
                        <div className="h-4 bg-tint rounded w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={filteredColumns.length + (selectable ? 1 : 0)} className="p-8 text-center text-ink/50">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const key = keyExtractor(row);
                  const isSelected = selectedKeys.has(key);
                  return (
                    <tr
                      key={key}
                      className={`hover:bg-tint/40 transition-colors ${isSelected ? 'bg-gold/5' : ''}`}
                    >
                      {selectable && (
                        <td className="p-3.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(key)}
                            className="rounded text-gold focus:ring-gold"
                          />
                        </td>
                      )}
                      {filteredColumns.map((col) => (
                        <td key={col.key} className={`p-3.5 text-ink ${col.className || ''}`}>
                          {col.render ? col.render(row) : row[col.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {onPageChange && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-field text-xs text-ink/70">
            <div>
              {totalCount !== undefined ? (
                <span>
                  Showing {Math.min((currentPage - 1) * pageSize + 1, totalCount)} to{' '}
                  {Math.min(currentPage * pageSize, totalCount)} of {totalCount} entries
                </span>
              ) : (
                <span>Page {currentPage}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="px-2.5 py-1 rounded-lg border border-line bg-paper disabled:opacity-40 hover:bg-tint transition-colors"
              >
                Previous
              </button>
              {totalPages && (
                <span className="px-2 font-medium">
                  {currentPage} / {totalPages}
                </span>
              )}
              <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={(totalPages !== undefined && currentPage >= totalPages) || loading}
                className="px-2.5 py-1 rounded-lg border border-line bg-paper disabled:opacity-40 hover:bg-tint transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
