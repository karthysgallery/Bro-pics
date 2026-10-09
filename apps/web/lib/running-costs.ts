import 'server-only';
import { applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { combineRunningCosts, logger, type BudgetSnapshot, type ExportRow, type RunningCosts } from '@bro-pics/shared';
import { getAdminApp } from './firebase-admin';

/**
 * Server side of Admin → Running costs. Reads the latest budget alert
 * (written by the `recordBudgetAlert` function) and, when the billing export
 * is set up, the per-service/per-day costs from BigQuery. See
 * packages/shared/src/billing/running-costs.ts for how they are combined.
 *
 * BILLING_EXPORT_TABLE: `project.dataset.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX`
 * BILLING_PROJECT_ID:   whose costs to show (default: the Firebase project)
 */

const TABLE_PATTERN = /^[A-Za-z0-9-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;
// Google updates the export a few times a day: an hour's cache keeps BigQuery use (and cost) negligible.
const CACHE_MS = 60 * 60 * 1000;
let cache: { at: number; value: RunningCosts } | null = null;

export function billingExportTable(): string | null {
  const table = (process.env.BILLING_EXPORT_TABLE ?? '').trim();
  return TABLE_PATTERN.test(table) ? table : null;
}

function billingProjectId(): string {
  return process.env.BILLING_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'bropics-app';
}

/** Six months of the export, summed per India-time day and service, after credits. */
export function exportQuery(table: string): string {
  return `
    SELECT
      FORMAT_TIMESTAMP('%Y-%m', usage_start_time, 'Asia/Kolkata') AS month,
      CAST(DATE(usage_start_time, 'Asia/Kolkata') AS STRING) AS day,
      service.description AS service,
      currency,
      SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) AS c), 0)) AS net
    FROM \`${table}\`
    WHERE project.id = @project
      AND usage_start_time >= TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE('Asia/Kolkata'), MONTH), INTERVAL 5 MONTH), 'Asia/Kolkata')
    GROUP BY month, day, service, currency`;
}

async function accessToken(): Promise<string> {
  const credential = getAdminApp().options.credential ?? applicationDefault();
  const token = await credential.getAccessToken();
  return token.access_token;
}

interface BigQueryResponse {
  jobComplete?: boolean;
  rows?: Array<{ f: Array<{ v: string | null }> }>;
  error?: { message?: string };
}

export async function fetchExportRows(table: string, fetchImpl: typeof fetch = fetch, token?: string): Promise<ExportRow[]> {
  const queryProject = table.split('.')[0]!;
  // BIGQUERY_ENDPOINT: a local stand-in for testing the page; never set in production.
  const localEndpoint = process.env.NODE_ENV !== 'production' && process.env.BIGQUERY_ENDPOINT ? process.env.BIGQUERY_ENDPOINT : null;
  const endpoint = localEndpoint ?? 'https://bigquery.googleapis.com';
  const res = await fetchImpl(`${endpoint}/bigquery/v2/projects/${encodeURIComponent(queryProject)}/queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? (localEndpoint ? 'local-test' : await accessToken())}` },
    body: JSON.stringify({
      query: exportQuery(table),
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [{ name: 'project', parameterType: { type: 'STRING' }, parameterValue: { value: billingProjectId() } }],
      timeoutMs: 20_000,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as BigQueryResponse;
  if (!res.ok || !body.jobComplete) throw new Error(`BigQuery: ${body.error?.message ?? `HTTP ${res.status}${body.jobComplete === false ? ' (still running)' : ''}`}`);
  return (body.rows ?? []).map((r) => ({
    month: r.f[0]!.v ?? '',
    day: r.f[1]!.v ?? '',
    service: r.f[2]!.v ?? 'Other',
    currency: r.f[3]!.v ?? 'INR',
    net: Number(r.f[4]!.v ?? 0),
  }));
}

export interface RunningCostsResult extends RunningCosts {
  /** Set when the export is configured but could not be read (permissions, wrong table). */
  exportError?: string;
  checkedAt: string;
}

export async function getRunningCosts(options: { fresh?: boolean } = {}): Promise<RunningCostsResult> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return { ...cache.value, checkedAt: new Date(cache.at).toISOString() };

  const db = getFirestore(getAdminApp());
  const ref = db.collection('ops').doc('runningCosts');
  const [snap, monthsSnap] = await Promise.all([ref.get(), ref.collection('months').get()]);
  const budget = (snap.exists ? (snap.data() as { budget?: BudgetSnapshot }).budget : undefined) ?? null;
  const budgetMonths = monthsSnap.docs.map((d) => d.data() as { month: string; amount: number });

  const table = billingExportTable();
  let exportRows: ExportRow[] | null = null;
  let exportError: string | undefined;
  if (table) {
    try {
      exportRows = await fetchExportRows(table);
    } catch (err) {
      exportError = err instanceof Error ? err.message : String(err);
      logger.warn('Running costs: billing export could not be read', { error: exportError });
    }
  }

  const value = combineRunningCosts({ now: new Date(), budget, budgetMonths, exportRows });
  if (table && exportRows === null) value.exportConfigured = true;
  if (!exportError) cache = { at: Date.now(), value };
  return { ...value, ...(exportError && { exportError }), checkedAt: new Date().toISOString() };
}

/** For tests. */
export function resetRunningCostsCache(): void {
  cache = null;
}
