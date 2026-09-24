import { describe, it, expect } from 'vitest';
import { BulkPrintFilesQuerySchema } from './bulk-print-files-query';

describe('BulkPrintFilesQuerySchema', () => {
  it('splits a comma-separated orderIds string, trimming whitespace', () => {
    const result = BulkPrintFilesQuerySchema.parse({ orderIds: 'order_1, order_2 ,order_3' });
    expect(result.orderIds).toEqual(['order_1', 'order_2', 'order_3']);
  });

  it('rejects an empty orderIds string', () => {
    expect(BulkPrintFilesQuerySchema.safeParse({ orderIds: '' }).success).toBe(false);
  });

  it('drops empty entries from stray commas', () => {
    const result = BulkPrintFilesQuerySchema.parse({ orderIds: 'order_1,,order_2' });
    expect(result.orderIds).toEqual(['order_1', 'order_2']);
  });

  it('rejects more than 20 order ids', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `order_${i}`).join(',');
    expect(BulkPrintFilesQuerySchema.safeParse({ orderIds: ids }).success).toBe(false);
  });

  it('accepts exactly 20 order ids', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `order_${i}`).join(',');
    expect(BulkPrintFilesQuerySchema.safeParse({ orderIds: ids }).success).toBe(true);
  });
});
