import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { renderPrintJob, type RenderJobDependencies } from './render-job';

async function solidPng(width: number, height: number, color: [number, number, number, number]): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(color, i * 4);
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function makeDeps(overrides: Partial<RenderJobDependencies> = {}): Promise<RenderJobDependencies> {
  const photo = await solidPng(4, 4, [255, 0, 0, 255]);
  const mockup = await solidPng(10, 10, [0, 0, 0, 0]);

  return {
    leaseJob: vi.fn().mockResolvedValue(undefined),
    failJob: vi.fn().mockResolvedValue(undefined),
    completeJobAndAdvanceOrder: vi.fn().mockResolvedValue(undefined),
    getPrintJob: vi.fn().mockResolvedValue({ orderId: 'order_1', itemId: 'item_1', personalizationId: 'p1' }),
    getOrderItem: vi.fn().mockResolvedValue({ variantId: 'variant_1' }),
    getVariant: vi.fn().mockResolvedValue({ printWidthPx: 10, printHeightPx: 10 }),
    getCustomizationsForPersonalization: vi.fn().mockResolvedValue([
      {
        id: 'cust_1',
        uploadId: 'upload_1',
        slotIndex: 0,
        templateVersion: 1,
        cropRect: { x: 0, y: 0, width: 4, height: 4 },
        rotationDeg: 0,
      },
    ]),
    getFrameTemplate: vi.fn().mockResolvedValue({
      mockupUrl: 'https://cdn.example.com/mockup.png',
      maskUrl: null,
      overlayUrl: null,
      printableRects: [{ slotIndex: 0, x: 0, y: 0, width: 1, height: 1 }],
    }),
    getUpload: vi.fn().mockResolvedValue({ originalPath: 'uploads/session_1/photo.jpg' }),
    fetchPublicAsset: vi.fn().mockResolvedValue(mockup),
    downloadPrivateFile: vi.fn().mockResolvedValue(photo),
    uploadPrintFile: vi.fn().mockResolvedValue('print-files/order_1/item_1/print.png'),
    markCustomizationsRendered: vi.fn().mockResolvedValue(undefined),
    markCustomizationsFailed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('renderPrintJob', () => {
  it('leases, renders, uploads, and completes on the happy path', async () => {
    const deps = await makeDeps();

    await renderPrintJob(deps, 'order_1_item_1');

    expect(deps.leaseJob).toHaveBeenCalledWith('order_1_item_1');
    expect(deps.downloadPrivateFile).toHaveBeenCalledWith('uploads/session_1/photo.jpg');
    expect(deps.uploadPrintFile).toHaveBeenCalledWith(
      'order_1',
      'item_1',
      'print.png',
      expect.any(Buffer),
      'image/png'
    );
    expect(deps.markCustomizationsRendered).toHaveBeenCalledWith(['cust_1'], 'print-files/order_1/item_1/print.png');
    expect(deps.completeJobAndAdvanceOrder).toHaveBeenCalledWith('order_1_item_1', 'print-files/order_1/item_1/print.png');
    expect(deps.failJob).not.toHaveBeenCalled();
  });

  it('composes multiple slots from a multi-slot personalization', async () => {
    const photoA = await solidPng(4, 4, [255, 0, 0, 255]);
    const photoB = await solidPng(4, 4, [0, 255, 0, 255]);
    const deps = await makeDeps({
      getCustomizationsForPersonalization: vi.fn().mockResolvedValue([
        { id: 'cust_1', uploadId: 'upload_1', slotIndex: 0, templateVersion: 1, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 },
        { id: 'cust_2', uploadId: 'upload_2', slotIndex: 1, templateVersion: 1, cropRect: { x: 0, y: 0, width: 4, height: 4 }, rotationDeg: 0 },
      ]),
      getFrameTemplate: vi.fn().mockResolvedValue({
        mockupUrl: 'https://cdn.example.com/mockup.png',
        maskUrl: null,
        overlayUrl: null,
        printableRects: [
          { slotIndex: 0, x: 0, y: 0, width: 0.5, height: 1 },
          { slotIndex: 1, x: 0.5, y: 0, width: 0.5, height: 1 },
        ],
      }),
      downloadPrivateFile: vi.fn().mockImplementation(async (path: string) => (path === 'a' ? photoA : photoB)),
      getUpload: vi.fn().mockImplementation(async (uploadId: string) => ({
        originalPath: uploadId === 'upload_1' ? 'a' : 'b',
      })),
    });

    await renderPrintJob(deps, 'order_1_item_1');

    expect(deps.markCustomizationsRendered).toHaveBeenCalledWith(['cust_1', 'cust_2'], expect.any(String));
  });

  it('fails the job and marks customizations failed when a lookup errors after leasing', async () => {
    const deps = await makeDeps({
      getFrameTemplate: vi.fn().mockResolvedValue(null),
    });

    await expect(renderPrintJob(deps, 'order_1_item_1')).rejects.toThrow(/Frame template not found/);

    expect(deps.failJob).toHaveBeenCalledWith('order_1_item_1', expect.stringContaining('Frame template not found'));
    expect(deps.markCustomizationsFailed).toHaveBeenCalledWith(['cust_1']);
    expect(deps.completeJobAndAdvanceOrder).not.toHaveBeenCalled();
  });

  it('propagates a not-leasable error without calling failJob (the job was never claimed)', async () => {
    class NotLeasable extends Error {}
    const deps = await makeDeps({
      leaseJob: vi.fn().mockRejectedValue(new NotLeasable('not leasable')),
    });

    await expect(renderPrintJob(deps, 'order_1_item_1')).rejects.toThrow('not leasable');
    expect(deps.failJob).not.toHaveBeenCalled();
    expect(deps.getPrintJob).not.toHaveBeenCalled();
  });

  it('fails the job without a customizations list when no customizations are found', async () => {
    const deps = await makeDeps({
      getCustomizationsForPersonalization: vi.fn().mockResolvedValue([]),
    });

    await expect(renderPrintJob(deps, 'order_1_item_1')).rejects.toThrow(/No customizations found/);
    expect(deps.failJob).toHaveBeenCalledWith('order_1_item_1', expect.stringContaining('No customizations found'));
    expect(deps.markCustomizationsFailed).not.toHaveBeenCalled();
  });

  it('renders personalization with text fields', async () => {
    const deps = await makeDeps({
      getCustomizationsForPersonalization: vi.fn().mockResolvedValue([
        {
          id: 'cust_1',
          uploadId: 'upload_1',
          slotIndex: 0,
          templateVersion: 1,
          cropRect: { x: 0, y: 0, width: 4, height: 4 },
          rotationDeg: 0,
          textFieldsJson: {
            headline: { value: 'Happy Birthday', fontFamily: 'var(--font-dancing-script)', color: '#111111' },
          },
        },
      ]),
      getFrameTemplate: vi.fn().mockResolvedValue({
        mockupUrl: 'https://cdn.example.com/mockup.png',
        maskUrl: null,
        overlayUrl: null,
        printableRects: [{ slotIndex: 0, x: 0, y: 0, width: 1, height: 1 }],
        textZones: [
          {
            fieldKey: 'headline',
            label: 'Headline',
            x: 0.1,
            y: 0.8,
            width: 0.8,
            height: 0.1,
            maxLength: 30,
            align: 'center',
            defaultFontFamily: 'dancing-script',
            defaultColor: '#000000',
          },
        ],
      }),
    });

    await renderPrintJob(deps, 'order_1_item_1');

    expect(deps.uploadPrintFile).toHaveBeenCalledWith(
      'order_1',
      'item_1',
      'print.png',
      expect.any(Buffer),
      'image/png'
    );
    expect(deps.completeJobAndAdvanceOrder).toHaveBeenCalledWith('order_1_item_1', 'print-files/order_1/item_1/print.png');
  });
});
