import type { Rect, RotationDeg } from '@bro-pics/shared';
import { renderPrintFile } from './render-print-file';

export interface RenderJobDependencies {
  // Firestore-backed steps — see packages/shared/src/print-jobs for the
  // lease/fail/complete state machine these wrap. Injected rather than
  // called directly so this module stays testable without a real
  // Firestore/Storage connection, mirroring how the payment webhook
  // (functions/src/webhooks/razorpay.ts) abstracts its transaction calls.
  leaseJob(jobId: string): Promise<void>;
  failJob(jobId: string, error: string): Promise<void>;
  completeJobAndAdvanceOrder(jobId: string, renderedFilePath: string): Promise<void>;
  getPrintJob(jobId: string): Promise<{ orderId: string; itemId: string; personalizationId: string } | null>;
  getOrderItem(orderId: string, itemId: string): Promise<{ variantId: string } | null>;
  getVariant(variantId: string): Promise<{ printWidthPx: number; printHeightPx: number } | null>;
  // Every slot Customization for this item's personalizationId, ordered
  // by slotIndex — a multi-slot collage item has more than one.
  getCustomizationsForPersonalization(personalizationId: string): Promise<
    Array<{
      id: string;
      uploadId: string;
      slotIndex: number;
      templateVersion: number;
      cropRect: Rect;
      rotationDeg: RotationDeg;
    }>
  >;
  getFrameTemplate(
    variantId: string,
    templateVersion: number
  ): Promise<{
    mockupUrl: string;
    maskUrl: string | null;
    overlayUrl: string | null;
    printableRects: Array<{ slotIndex: number; x: number; y: number; width: number; height: number }>;
  } | null>;
  getUpload(uploadId: string): Promise<{ originalPath: string } | null>;
  // public/** template assets (world-readable per storage.rules — see
  // BE-05) — fetched directly by URL, unlike the private original photo.
  fetchPublicAsset(url: string): Promise<Buffer>;
  // uploads/** originals are private — read via the Storage Admin SDK,
  // never a signed URL (see Upload.originalPath's own doc comment).
  downloadPrivateFile(path: string): Promise<Buffer>;
  // Uploads to print-files/{orderId}/{itemId}/{filename} and returns that
  // Storage object path.
  uploadPrintFile(orderId: string, itemId: string, filename: string, buffer: Buffer, contentType: string): Promise<string>;
  markCustomizationsRendered(customizationIds: string[], renderedFilePath: string): Promise<void>;
  markCustomizationsFailed(customizationIds: string[]): Promise<void>;
}

/**
 * The glue between BE-16's pure renderPrintFile and BE-17's job-state
 * machine [BE-18]: leases the job, assembles every input renderPrintFile
 * needs from Firestore/Storage, renders, uploads the result, and advances
 * both the Customization docs and (via completeJobAndAdvanceOrder) the
 * order itself. No text-field or clipart rendering yet — see BE-16's
 * PROJECT_STATUS.md note for why text stays deferred; clipart is deferred
 * here for the same reason a font-picker gap was: extra per-personalization
 * lookup complexity that isn't what makes print_ready reachable. Likewise
 * proof.jpg / sha256 / dimensions / rendererVersion metadata (named in
 * BE-16's original task text) are not produced by this pass — none of
 * them block the order from reaching print_ready, so they're a separate,
 * logged loose end rather than scope this function needs to close.
 */
export async function renderPrintJob(deps: RenderJobDependencies, jobId: string): Promise<void> {
  await deps.leaseJob(jobId);

  const job = await deps.getPrintJob(jobId);
  if (!job) {
    // Leased successfully but the doc vanished before we could re-read
    // it — should be unreachable outside a hand-edited/corrupted store.
    // Still a genuine failure, so it must propagate like every other
    // failure below rather than resolving as if the render succeeded.
    const message = `Print job ${jobId} not found immediately after leasing`;
    await deps.failJob(jobId, message);
    throw new Error(message);
  }

  let customizationIds: string[] = [];
  try {
    const orderItem = await deps.getOrderItem(job.orderId, job.itemId);
    if (!orderItem) throw new Error(`Order item ${job.itemId} not found on order ${job.orderId}`);

    const variant = await deps.getVariant(orderItem.variantId);
    if (!variant) throw new Error(`Variant ${orderItem.variantId} not found`);

    const customizations = await deps.getCustomizationsForPersonalization(job.personalizationId);
    if (customizations.length === 0) {
      throw new Error(`No customizations found for personalization ${job.personalizationId}`);
    }
    customizationIds = customizations.map((c) => c.id);

    // Every slot of one item was built against the same template version
    // (a personalization is edited as one unit — see
    // CustomizationSchema.templateVersion's own doc comment), so the
    // first slot's version is authoritative for the whole item.
    const templateVersion = customizations[0]!.templateVersion;
    const template = await deps.getFrameTemplate(orderItem.variantId, templateVersion);
    if (!template) {
      throw new Error(`Frame template not found for variant ${orderItem.variantId} v${templateVersion}`);
    }

    const [mockupBuffer, overlayBuffer, maskBuffer] = await Promise.all([
      deps.fetchPublicAsset(template.mockupUrl),
      template.overlayUrl ? deps.fetchPublicAsset(template.overlayUrl) : Promise.resolve(null),
      template.maskUrl ? deps.fetchPublicAsset(template.maskUrl) : Promise.resolve(null),
    ]);

    const slots = await Promise.all(
      customizations.map(async (customization) => {
        const upload = await deps.getUpload(customization.uploadId);
        if (!upload) throw new Error(`Upload ${customization.uploadId} not found`);
        const photoBuffer = await deps.downloadPrivateFile(upload.originalPath);
        const rect = template.printableRects.find((r) => r.slotIndex === customization.slotIndex);
        if (!rect) throw new Error(`No printableRect for slotIndex ${customization.slotIndex}`);
        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          photoBuffer,
          cropRect: customization.cropRect,
          rotationDeg: customization.rotationDeg,
          maskBuffer,
        };
      })
    );

    const printBuffer = await renderPrintFile({
      printWidthPx: variant.printWidthPx,
      printHeightPx: variant.printHeightPx,
      slots,
      mockupBuffer,
      overlayBuffer,
    });

    const renderedFilePath = await deps.uploadPrintFile(job.orderId, job.itemId, 'print.png', printBuffer, 'image/png');

    await deps.markCustomizationsRendered(customizationIds, renderedFilePath);
    await deps.completeJobAndAdvanceOrder(jobId, renderedFilePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (customizationIds.length > 0) {
      await deps.markCustomizationsFailed(customizationIds);
    }
    await deps.failJob(jobId, message);
    throw error;
  }
}
