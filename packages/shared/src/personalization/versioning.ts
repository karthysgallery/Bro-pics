import { z } from 'zod';
import { PersonalizationStateSchema, type PersonalizationState } from './state';
import { PersonalizationTemplateSchema, type PersonalizationTemplate } from './template-schema';

/**
 * What an order stores about a personalized item: enough to RE-RENDER exactly
 * what the customer bought, with no dependence on the live product or the
 * current template. (Templates change; orders must not.)
 */
export const OrderPersonalizationSnapshotSchema = z.object({
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  /** The customer's choices, verbatim (asset ids, transforms, rotations, texts). */
  state: PersonalizationStateSchema,
  /** The template definition as it was at purchase — makes the order reproducible even if that version is later archived or its assets reorganised. */
  template: PersonalizationTemplateSchema,
  capturedAt: z.string(),
});
export type OrderPersonalizationSnapshot = z.infer<typeof OrderPersonalizationSnapshotSchema>;

export function buildOrderSnapshot(template: PersonalizationTemplate, state: PersonalizationState, now: Date = new Date()): OrderPersonalizationSnapshot {
  if (state.templateId !== template.id || state.templateVersion !== template.version) {
    throw new Error(
      `Personalization was made against ${state.templateId}@v${state.templateVersion} but is being ordered with ${template.id}@v${template.version}.`
    );
  }
  return {
    templateId: template.id,
    templateVersion: template.version,
    state: PersonalizationStateSchema.parse(state),
    template,
    capturedAt: now.toISOString(),
  };
}

/** Picks the exact version an order pinned. Never "the current one": a later edit must not change an old order. */
export function resolveTemplateVersion(
  templates: readonly PersonalizationTemplate[],
  templateId: string,
  version: number
): PersonalizationTemplate | null {
  return templates.find((t) => t.id === templateId && t.version === version) ?? null;
}

/** The newest PUBLISHED version — what customers starting a NEW personalization get. Drafts/archived are invisible to them. */
export function latestPublished(templates: readonly PersonalizationTemplate[], templateId: string): PersonalizationTemplate | null {
  const published = templates.filter((t) => t.id === templateId && t.status === 'published');
  if (published.length === 0) return null;
  return published.reduce((best, t) => (t.version > best.version ? t : best));
}

/** Published templates are immutable: any change must be a NEW version. Returns the next draft, never mutating the input. */
export function nextDraftVersion(templates: readonly PersonalizationTemplate[], base: PersonalizationTemplate): PersonalizationTemplate {
  const highest = templates.filter((t) => t.id === base.id).reduce((m, t) => Math.max(m, t.version), 0);
  return { ...base, version: highest + 1, status: 'draft', publishedAt: undefined };
}

const ALLOWED: Record<PersonalizationTemplate['status'], PersonalizationTemplate['status'][]> = {
  draft: ['review', 'published', 'archived'],
  review: ['draft', 'published', 'archived'],
  published: ['archived'],
  archived: [],
};

/** Lifecycle guard: a published template can only be archived, never edited back into a draft. */
export function canTransitionStatus(from: PersonalizationTemplate['status'], to: PersonalizationTemplate['status']): boolean {
  return ALLOWED[from].includes(to);
}
