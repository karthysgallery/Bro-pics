import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ItemFilesBox, printStatusText } from './ItemFilesBox';

// One stable user object, as the real auth context provides (a new one each render would reload forever).
const stableAuth = { user: { getIdToken: async () => 'tok' } };
vi.mock('../../lib/auth-context', () => ({ useAuth: () => stableAuth }));
const showToast = vi.fn();
vi.mock('../ui/Toast', () => ({ useToast: () => ({ showToast }) }));

const files = {
  itemId: 'item_1',
  preview: true,
  print: { available: false, jobStatus: 'failed_permanent', jobError: 'boom' },
  originals: [
    { uploadId: 'up_1', label: 'Photo 1', widthPx: 4000, heightPx: 3000, available: true },
    { uploadId: 'up_2', label: 'Photo 2', widthPx: null, heightPx: null, available: false },
  ],
};

describe('printStatusText', () => {
  it('says what to do in each state', () => {
    expect(printStatusText({ available: true, jobStatus: 'done', jobError: null })).toBe('Ready to print');
    expect(printStatusText({ available: false, jobStatus: null, jobError: null })).toMatch(/print service has not picked/);
    expect(printStatusText({ available: false, jobStatus: 'queued', jobError: null })).toMatch(/Waiting/);
    expect(printStatusText({ available: false, jobStatus: 'failed_permanent', jobError: 'boom' })).toMatch(/boom.*Render again.*by hand/);
  });
});

describe('ItemFilesBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/files')) return new Response(JSON.stringify(files));
      if (url.includes('/download')) return new Response(JSON.stringify({ url: 'https://signed.example/x', type: 'original' }));
      return new Response('{}', { status: 404 });
    }));
  });

  it('shows the preview, every original photo and the print-ready state; disabled where a file is missing', async () => {
    render(<ItemFilesBox orderId="order_1" itemId="item_1" />);
    expect(await screen.findByText('Download preview')).toBeTruthy();
    expect(screen.getByText('Photo 1')).toBeTruthy();
    expect(screen.getByText(/4000×3000 px/)).toBeTruthy();
    expect((screen.getByText('File missing') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText('Download print-ready file') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Render again')).toBeTruthy();
  });

  it('asks the server for the chosen photo when its button is pressed', async () => {
    render(<ItemFilesBox orderId="order_1" itemId="item_1" />);
    fireEvent.click(await screen.findByText('Download original'));
    await waitFor(() => {
      const calls = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
      expect(calls.some((u) => u.includes('/download?type=original&upload=up_1'))).toBe(true);
    });
  });
});
