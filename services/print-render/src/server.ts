import express, { type Express } from 'express';
import { logger } from '@bro-pics/shared';
// Not from the main '@bro-pics/shared' barrel — see print-jobs.ts's own
// doc comment for why. This is a standalone Cloud Run service, so
// importing it directly here is exactly the intended use.
import { PrintJobNotLeasableError } from '@bro-pics/shared/src/print-jobs/print-jobs';
import { renderPrintJob, type RenderJobDependencies } from './render-job';
import { verifyFontFiles, verifyFontsRender } from './render-text';
import { createCutout, CutoutError, type CutoutDependencies } from './cutout-job';
import { CutoutUnavailableError, cutoutModelPresent } from './background-removal';

/**
 * deps is injected (rather than built internally) so tests can exercise
 * the route with fakes, the same reason render-job.ts itself takes
 * injected dependencies — this route is a thin adapter, not where the
 * Firestore/Storage wiring lives (see firestore-render-deps.ts for that,
 * wired in only at process start in this file's bottom section).
 *
 * [BE-18] No automatic invoker calls this endpoint yet — the printJobs
 * queue (BE-17) intentionally deferred the Cloud Tasks dispatcher that
 * would call it on a schedule. Until that exists, this must be triggered
 * manually (or by a later Cloud Scheduler sweep) for a job to actually
 * render. That's a one-line gap, not a missing pipeline stage — every
 * other step from payment to print_ready is wired and automatic.
 */
export function createServer(deps: RenderJobDependencies, cutoutDeps?: CutoutDependencies): Express {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  app.get('/health', async (_req, res) => {
    const fonts = verifyFontFiles();
    const rendering = await verifyFontsRender().catch((error: unknown) => ({ checked: false, ok: false, fallingBack: [], error: String(error) }));
    res.status(200).json({ status: 'ok', fonts: { ...fonts, ok: fonts.ok && rendering.ok, rendering }, cutout: { modelPresent: cutoutModelPresent() } });
  });

  // Background removal for a customer's upload (called by the website, which has
  // already checked the customer owns the photo). One at a time per instance.
  app.post('/cutout/:uploadId', async (req, res) => {
    const { uploadId } = req.params;
    if (!cutoutDeps) {
      res.status(503).json({ error: 'Background removal is not configured on this service' });
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uploadId)) {
      res.status(400).json({ error: 'Invalid upload id' });
      return;
    }
    try {
      const result = await createCutout(cutoutDeps, uploadId);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof CutoutError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      if (error instanceof CutoutUnavailableError) {
        logger.error('Background removal unavailable', { uploadId, error: error.message });
        res.status(503).json({ error: 'Background removal is not available right now' });
        return;
      }
      logger.error('Background removal failed', { uploadId, error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: 'Background removal failed' });
    }
  });

  app.post('/render/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
      await renderPrintJob(deps, jobId);
      res.status(200).json({ status: 'done', jobId });
    } catch (error) {
      if (error instanceof PrintJobNotLeasableError) {
        res.status(409).json({ error: error.message });
        return;
      }
      logger.error('Render job failed', { jobId, error: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const fontCheck = verifyFontFiles();
  if (!fontCheck.ok) {
    logger.warn('Missing font files at startup', { missing: fontCheck.missing });
  } else {
    logger.info('All required fonts verified for print rendering');
  }
  void verifyFontsRender()
    .then((r) => {
      if (r.checked && !r.ok) logger.error('Fonts are on disk but text renders in the fallback font', { fallingBack: r.fallingBack });
    })
    .catch((error: unknown) => logger.warn('Font render check failed', { error: String(error) }));

  const { buildFirestoreRenderDeps, buildFirestoreCutoutDeps } = await import('./firestore-render-deps');
  const port = process.env.PORT ? Number(process.env.PORT) : 8080;
  createServer(buildFirestoreRenderDeps(), buildFirestoreCutoutDeps()).listen(port, () => {
    logger.info('print-render listening', { port });
  });
}
