import { NextResponse } from 'next/server';
import { catalogueGuard } from '../../../../../../lib/catalogue/guard';
import { listFrameModels, readFramingCostRates } from '../../../../../../lib/catalogue/frame-models';
import { listTemplateSummaries } from '../../../../../../lib/personalization-templates';

/** What the guided product editor chooses from: categories, frame models (with cost), cost rates, collage designs. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:read');
  if (!g.ok) return g.response;
  const [categories, frameModels, rates, templates] = await Promise.all([
    g.db.collection('categories').get(),
    listFrameModels(g.db, { includeInactive: true }),
    readFramingCostRates(g.db),
    listTemplateSummaries(g.db),
  ]);
  return NextResponse.json({
    categories: categories.docs.map((d) => ({ id: d.id, name: String(d.get('name') ?? d.id), slug: String(d.get('slug') ?? '') })).sort((a, b) => a.name.localeCompare(b.name)),
    frameModels,
    rates,
    // Designs made for collages (not the ones this editor makes by itself).
    collageTemplates: templates.filter((t) => t.type !== 'ready_made' && !(t.type === 'single_photo' && /-[pl]\d_\d\d$/.test(t.id))),
  });
}
