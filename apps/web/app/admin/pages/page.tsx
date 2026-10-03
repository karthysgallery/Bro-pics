'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { AdminModal } from '../../../components/admin/AdminModal';
import { FormField } from '../../../components/admin/AdminForm';
import { useToast } from '../../../components/ui/Toast';
import type { Page, FaqItem, Testimonial } from '@bro-pics/shared';

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'object' && '_seconds' in (dateVal as { _seconds: number })) {
    return new Date((dateVal as { _seconds: number })._seconds * 1000).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  const d = new Date(dateVal as string | number | Date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type TabType = 'pages' | 'faqs' | 'testimonials';

export default function AdminContentCMSPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('pages');
  const [loading, setLoading] = useState(true);

  // Pages state
  const [pages, setPages] = useState<Page[]>([]);
  const [editingPage, setEditingPage] = useState<Partial<Page> | null>(null);
  const [isPageModalOpen, setIsPageModalOpen] = useState(false);

  // FAQs state
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [editingFaq, setEditingFaq] = useState<Partial<FaqItem> | null>(null);
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

  // Testimonials state
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [editingTestimonial, setEditingTestimonial] = useState<Partial<Testimonial> | null>(null);
  const [isTestimonialModalOpen, setIsTestimonialModalOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  // Fetch all CMS content
  const fetchAllData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [pagesRes, faqsRes, testRes] = await Promise.all([
        fetch('/api/admin/pages', { headers }),
        fetch('/api/admin/faqs', { headers }),
        fetch('/api/admin/testimonials', { headers }),
      ]);

      if (pagesRes.ok) {
        const pData = await pagesRes.json();
        setPages(pData.pages || []);
      }
      if (faqsRes.ok) {
        const fData = await faqsRes.json();
        setFaqs(fData.faqs || []);
      }
      if (testRes.ok) {
        const tData = await testRes.json();
        setTestimonials(tData.testimonials || []);
      }
    } catch {
      showToast('Error loading CMS content', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [user]);

  // Page Handlers
  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingPage || !editingPage.title || !editingPage.slug) return;
    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const isNew = !editingPage.id;
      const url = isNew ? '/api/admin/pages' : `/api/admin/pages/${editingPage.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const payload = {
        title: editingPage.title,
        slug: editingPage.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        bodyHtml: editingPage.bodyHtml || '<p></p>',
        seo: {
          title: editingPage.seo?.title || editingPage.title,
          description: editingPage.seo?.description || '',
        },
        isPublished: editingPage.isPublished ?? true,
      };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save page');
      }

      showToast(`Page ${isNew ? 'created' : 'updated'} successfully`, 'success');
      setIsPageModalOpen(false);
      setEditingPage(null);
      fetchAllData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving page', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // FAQ Handlers
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingFaq || !editingFaq.question) return;
    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const isNew = !editingFaq.id;
      const url = isNew ? '/api/admin/faqs' : `/api/admin/faqs/${editingFaq.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const payload = {
        question: editingFaq.question,
        answerHtml: editingFaq.answerHtml || '<p></p>',
        section: editingFaq.section || 'General',
        sortOrder: Number(editingFaq.sortOrder) || faqs.length + 1,
        isActive: editingFaq.isActive ?? true,
      };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save FAQ');
      }

      showToast(`FAQ item ${isNew ? 'created' : 'updated'} successfully`, 'success');
      setIsFaqModalOpen(false);
      setEditingFaq(null);
      fetchAllData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving FAQ', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Testimonial Handlers
  const handleSaveTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingTestimonial || !editingTestimonial.authorName) return;
    setIsSaving(true);
    try {
      const token = await user.getIdToken();
      const isNew = !editingTestimonial.id;
      const url = isNew ? '/api/admin/testimonials' : `/api/admin/testimonials/${editingTestimonial.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const payload = {
        authorName: editingTestimonial.authorName,
        rating: Number(editingTestimonial.rating) || 5,
        quote: editingTestimonial.quote || '',
        authorLocation: editingTestimonial.authorLocation || '',
        sortOrder: Number(editingTestimonial.sortOrder) || testimonials.length + 1,
        isFeatured: editingTestimonial.isFeatured ?? true,
        isActive: editingTestimonial.isActive ?? true,
      };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save testimonial');
      }

      showToast(`Testimonial ${isNew ? 'created' : 'updated'} successfully`, 'success');
      setIsTestimonialModalOpen(false);
      setEditingTestimonial(null);
      fetchAllData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving testimonial', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">Content CMS</h1>
          <p className="text-xs text-ink/60">
            Manage static policy pages, FAQ help centers, guides, and customer testimonials.
          </p>
        </div>

        <div>
          {activeTab === 'pages' && (
            <button
              onClick={() => {
                setEditingPage({
                  title: '',
                  slug: '',
                  bodyHtml: '<p>Write your page content here...</p>',
                  seo: { title: '', description: '' },
                  isPublished: true,
                });
                setIsPageModalOpen(true);
              }}
              className="px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              + Create New Page
            </button>
          )}

          {activeTab === 'faqs' && (
            <button
              onClick={() => {
                setEditingFaq({
                  question: '',
                  answerHtml: '<p>Answer explanation...</p>',
                  section: 'General',
                  sortOrder: faqs.length + 1,
                  isActive: true,
                });
                setIsFaqModalOpen(true);
              }}
              className="px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              + Add FAQ Question
            </button>
          )}

          {activeTab === 'testimonials' && (
            <button
              onClick={() => {
                setEditingTestimonial({
                  authorName: '',
                  rating: 5,
                  quote: '',
                  authorLocation: 'Bengaluru, KA',
                  sortOrder: testimonials.length + 1,
                  isFeatured: true,
                  isActive: true,
                });
                setIsTestimonialModalOpen(true);
              }}
              className="px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              + Add Testimonial
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button
          onClick={() => setActiveTab('pages')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'pages'
              ? 'bg-ink text-paper dark:bg-paper dark:text-ink'
              : 'text-ink/60 hover:text-ink hover:bg-field'
          }`}
        >
          📄 Policy & Static Pages ({pages.length})
        </button>
        <button
          onClick={() => setActiveTab('faqs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'faqs'
              ? 'bg-ink text-paper dark:bg-paper dark:text-ink'
              : 'text-ink/60 hover:text-ink hover:bg-field'
          }`}
        >
          ❓ FAQ Help Center ({faqs.length})
        </button>
        <button
          onClick={() => setActiveTab('testimonials')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'testimonials'
              ? 'bg-ink text-paper dark:bg-paper dark:text-ink'
              : 'text-ink/60 hover:text-ink hover:bg-field'
          }`}
        >
          💬 Testimonials ({testimonials.length})
        </button>
      </div>

      {/* Content Panels */}
      {loading ? (
        <div className="p-12 space-y-3 animate-pulse bg-paper rounded-2xl border border-line">
          <div className="h-8 bg-field rounded-xl w-1/3" />
          <div className="h-12 bg-field rounded-xl" />
          <div className="h-12 bg-field rounded-xl" />
        </div>
      ) : (
        <>
          {/* Static Pages List */}
          {activeTab === 'pages' && (
            <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
              {pages.length === 0 ? (
                <div className="p-16 text-center text-xs text-ink/50 space-y-2">
                  <span className="text-3xl block">📄</span>
                  <p>No static pages created yet.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                      <th className="p-3">Page Title</th>
                      <th className="p-3">Slug URL</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Last Updated</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {pages.map((p) => (
                      <tr key={p.id} className="hover:bg-field/30 transition-colors">
                        <td className="p-3 font-semibold text-ink">{p.title}</td>
                        <td className="p-3 font-mono text-gold-deep">/{p.slug}</td>
                        <td className="p-3">
                          {p.isPublished ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                              Published
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field text-ink/50 border border-line">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-ink/60 font-mono text-2xs">
                          {formatISTDate(p.updatedAt)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => {
                              setEditingPage(p);
                              setIsPageModalOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-field hover:bg-gold/10 hover:text-gold-deep text-2xs font-bold transition-colors"
                          >
                            Edit Page ✏️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* FAQs List */}
          {activeTab === 'faqs' && (
            <div className="space-y-4">
              {faqs.length === 0 ? (
                <div className="p-16 text-center text-xs text-ink/50 space-y-2 rounded-2xl border border-line bg-paper">
                  <span className="text-3xl block">❓</span>
                  <p>No FAQ questions created yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {faqs.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 rounded-2xl border border-line bg-paper shadow-xs space-y-2 text-xs relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-gold/10 text-gold-deep border border-gold/30">
                          {f.section || 'General'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-2xs text-ink/40 font-mono">#{f.sortOrder}</span>
                          <button
                            onClick={() => {
                              setEditingFaq(f);
                              setIsFaqModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded bg-field hover:bg-field-hover text-2xs font-bold text-ink transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold text-ink text-sm">{f.question}</h3>
                      <div
                        className="text-ink/70 line-clamp-3 text-xs prose prose-xs"
                        dangerouslySetInnerHTML={{ __html: f.answerHtml }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Testimonials List */}
          {activeTab === 'testimonials' && (
            <div className="space-y-4">
              {testimonials.length === 0 ? (
                <div className="p-16 text-center text-xs text-ink/50 space-y-2 rounded-2xl border border-line bg-paper">
                  <span className="text-3xl block">💬</span>
                  <p>No customer testimonials added yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {testimonials.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 rounded-2xl border border-line bg-paper shadow-xs space-y-2 text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-amber-500 font-bold">
                            {'★'.repeat(t.rating || 5)}
                          </div>
                          {t.isFeatured && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-gold/10 text-gold-deep border border-gold/30">
                              Featured
                            </span>
                          )}
                        </div>
                        <p className="text-ink/80 italic text-xs">&ldquo;{t.quote}&rdquo;</p>
                      </div>

                      <div className="pt-3 border-t border-line flex items-center justify-between">
                        <div>
                          <div className="font-bold text-ink">{t.authorName}</div>
                          {t.authorLocation && (
                            <div className="text-ink/50 text-2xs">{t.authorLocation}</div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditingTestimonial(t);
                            setIsTestimonialModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-field hover:bg-field-hover text-2xs font-bold text-ink transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Page Modal */}
      <AdminModal
        isOpen={isPageModalOpen}
        onClose={() => setIsPageModalOpen(false)}
        title={editingPage?.id ? 'Edit Static Page' : 'Create Static Page'}
        description="Configure page slug, title, rich HTML content, and SEO metadata."
      >
        <form onSubmit={handleSavePage} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <FormField label="Page Title" required>
            <input
              type="text"
              value={editingPage?.title || ''}
              onChange={(e) => {
                const val = e.target.value;
                setEditingPage((prev) => ({
                  ...prev,
                  title: val,
                  slug: prev?.slug || val.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                }));
              }}
              placeholder="e.g. Terms of Service, Picture Quality Guide"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <FormField label="URL Slug" hint="Unique page path (/privacy-policy)" required>
            <input
              type="text"
              value={editingPage?.slug || ''}
              onChange={(e) =>
                setEditingPage((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))
              }
              placeholder="e.g. terms-of-service"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <FormField label="Page Content (HTML Format)" required>
            <textarea
              rows={8}
              value={editingPage?.bodyHtml || ''}
              onChange={(e) =>
                setEditingPage((prev) => ({ ...prev, bodyHtml: e.target.value }))
              }
              placeholder="<h2>Heading</h2><p>Page description paragraph...</p>"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="SEO Meta Title" hint="Max 60 chars">
              <input
                type="text"
                value={editingPage?.seo?.title || ''}
                onChange={(e) =>
                  setEditingPage((prev) => ({
                    ...prev,
                    seo: { ...(prev?.seo || {}), title: e.target.value },
                  }))
                }
                placeholder="BroPics - Terms of Service"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              />
            </FormField>

            <FormField label="Publish Status">
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={editingPage?.isPublished ?? true}
                  onChange={(e) =>
                    setEditingPage((prev) => ({ ...prev, isPublished: e.target.checked }))
                  }
                  className="rounded text-gold focus:ring-gold"
                />
                <span className="text-xs font-semibold text-ink">Publish Page Live</span>
              </label>
            </FormField>
          </div>

          <FormField label="SEO Meta Description" hint="Max 160 chars">
            <textarea
              rows={2}
              value={editingPage?.seo?.description || ''}
              onChange={(e) =>
                setEditingPage((prev) => ({
                  ...prev,
                  seo: { ...(prev?.seo || {}), description: e.target.value },
                }))
              }
              placeholder="Summary for search engines..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setIsPageModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Page'}
            </button>
          </div>
        </form>
      </AdminModal>

      {/* FAQ Modal */}
      <AdminModal
        isOpen={isFaqModalOpen}
        onClose={() => setIsFaqModalOpen(false)}
        title={editingFaq?.id ? 'Edit FAQ Item' : 'Add FAQ Item'}
        description="Create or edit help center question and sanitized HTML answer."
      >
        <form onSubmit={handleSaveFaq} className="space-y-4">
          <FormField label="Question" required>
            <input
              type="text"
              value={editingFaq?.question || ''}
              onChange={(e) =>
                setEditingFaq((prev) => ({ ...prev, question: e.target.value }))
              }
              placeholder="e.g. How long does framing & dispatch take?"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category / Section" required>
              <input
                type="text"
                value={editingFaq?.section || 'General'}
                onChange={(e) =>
                  setEditingFaq((prev) => ({ ...prev, section: e.target.value }))
                }
                placeholder="Ordering, Shipping, Quality, Framing"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                required
              />
            </FormField>

            <FormField label="Sort Order">
              <input
                type="number"
                value={editingFaq?.sortOrder || 1}
                onChange={(e) =>
                  setEditingFaq((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              />
            </FormField>
          </div>

          <FormField label="Answer (HTML Content)" required>
            <textarea
              rows={5}
              value={editingFaq?.answerHtml || ''}
              onChange={(e) =>
                setEditingFaq((prev) => ({ ...prev, answerHtml: e.target.value }))
              }
              placeholder="<p>Our standard production takes 2-3 business days...</p>"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setIsFaqModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save FAQ'}
            </button>
          </div>
        </form>
      </AdminModal>

      {/* Testimonial Modal */}
      <AdminModal
        isOpen={isTestimonialModalOpen}
        onClose={() => setIsTestimonialModalOpen(false)}
        title={editingTestimonial?.id ? 'Edit Testimonial' : 'Add Testimonial'}
        description="Showcase genuine customer reviews and feedback."
      >
        <form onSubmit={handleSaveTestimonial} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Author Name" required>
              <input
                type="text"
                value={editingTestimonial?.authorName || ''}
                onChange={(e) =>
                  setEditingTestimonial((prev) => ({ ...prev, authorName: e.target.value }))
                }
                placeholder="e.g. Karthik R."
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                required
              />
            </FormField>

            <FormField label="Star Rating (1 - 5)">
              <select
                value={editingTestimonial?.rating || 5}
                onChange={(e) =>
                  setEditingTestimonial((prev) => ({ ...prev, rating: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              >
                <option value={5}>5 Stars ★★★★★</option>
                <option value={4}>4 Stars ★★★★☆</option>
                <option value={3}>3 Stars ★★★☆☆</option>
                <option value={2}>2 Stars ★★☆☆☆</option>
                <option value={1}>1 Star ★☆☆☆☆</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Location">
              <input
                type="text"
                value={editingTestimonial?.authorLocation || ''}
                onChange={(e) =>
                  setEditingTestimonial((prev) => ({ ...prev, authorLocation: e.target.value }))
                }
                placeholder="e.g. Bengaluru, Karnataka"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              />
            </FormField>

            <FormField label="Sort Order">
              <input
                type="number"
                value={editingTestimonial?.sortOrder || 1}
                onChange={(e) =>
                  setEditingTestimonial((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              />
            </FormField>
          </div>

          <FormField label="Review Quote" required>
            <textarea
              rows={4}
              value={editingTestimonial?.quote || ''}
              onChange={(e) =>
                setEditingTestimonial((prev) => ({ ...prev, quote: e.target.value }))
              }
              placeholder="The frame quality and packaging exceeded my expectations..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={editingTestimonial?.isFeatured ?? true}
                onChange={(e) =>
                  setEditingTestimonial((prev) => ({ ...prev, isFeatured: e.target.checked }))
                }
                className="rounded text-gold focus:ring-gold"
              />
              Feature on Homepage
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={editingTestimonial?.isActive ?? true}
                onChange={(e) =>
                  setEditingTestimonial((prev) => ({ ...prev, isActive: e.target.checked }))
                }
                className="rounded text-gold focus:ring-gold"
              />
              Active
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setIsTestimonialModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Testimonial'}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
