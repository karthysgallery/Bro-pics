'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { StatusChip } from '../../../../components/admin/StatusChip';
import { AdminModal } from '../../../../components/admin/AdminModal';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';
import type { NotificationTemplate, NotificationOutboxEntry } from '@bro-pics/shared';

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'object' && '_seconds' in (dateVal as { _seconds: number })) {
    return new Date((dateVal as { _seconds: number })._seconds * 1000).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const d = new Date(dateVal as string | number | Date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type TabType = 'templates' | 'logs';

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('templates');
  const [loading, setLoading] = useState(true);

  // Templates state
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Partial<NotificationTemplate> | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<NotificationOutboxEntry[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isResending, setIsResending] = useState<string | null>(null);

  // Fetch templates & logs
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      let logUrl = '/api/admin/notification-log';
      if (selectedStatus !== 'all') {
        logUrl += `?status=${selectedStatus}`;
      }

      const [templatesRes, logsRes] = await Promise.all([
        fetch('/api/admin/notification-templates', { headers }),
        fetch(logUrl, { headers }),
      ]);

      if (templatesRes.ok) {
        const d = await templatesRes.json();
        setTemplates(d.templates || []);
      }
      if (logsRes.ok) {
        const d = await logsRes.json();
        setLogs(d.entries || []);
      }
    } catch {
      showToast('Error loading notification data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, selectedStatus]);

  // Handle Save Template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingTemplate || !editingTemplate.key || !editingTemplate.body) return;
    setIsSavingTemplate(true);
    try {
      const token = await user.getIdToken();
      const isExisting = templates.some((t) => t.key === editingTemplate.key);
      const url = isExisting
        ? `/api/admin/notification-templates/${editingTemplate.key}`
        : '/api/admin/notification-templates';
      const method = isExisting ? 'PATCH' : 'POST';

      const payload = {
        key: editingTemplate.key,
        subject: editingTemplate.subject || '',
        body: editingTemplate.body,
        variables: editingTemplate.variables || ['orderId', 'customerName', 'totalAmount'],
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
        throw new Error(errJson.message || 'Failed to save notification template');
      }

      showToast(`Template ${editingTemplate.key} saved successfully`, 'success');
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      fetchData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error saving template', 'error');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Handle Resend Outbox Entry
  const handleResend = async (logId: string) => {
    if (!user) return;
    setIsResending(logId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/notification-log/${logId}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to resend notification');
      }

      showToast('Notification re-queued for delivery', 'success');
      fetchData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error re-queueing notification', 'error');
    } finally {
      setIsResending(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/admin/settings"
              className="text-xs text-ink/60 hover:text-gold font-semibold"
            >
              ← Settings
            </Link>
          </div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-ink">
            Notifications Hub
          </h1>
          <p className="text-xs text-ink/60">
            Configure automated transactional email/SMS templates and monitor notification delivery outbox logs.
          </p>
        </div>

        {activeTab === 'templates' && (
          <button
            onClick={() => {
              setEditingTemplate({
                key: 'order.shipped',
                subject: 'Your BroPics Frame Order #{{orderId}} has shipped!',
                body:
                  'Hello {{customerName}},\n\nYour handcrafted frame has been packaged and handed over to courier. Track your parcel here: {{trackingUrl}}\n\nThank you for choosing BroPics!',
                variables: ['orderId', 'customerName', 'trackingUrl', 'courierName'],
              });
              setIsTemplateModalOpen(true);
            }}
            className="px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            + Create Template
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'templates'
              ? 'bg-ink text-paper dark:bg-paper dark:text-ink'
              : 'text-ink/60 hover:text-ink hover:bg-field'
          }`}
        >
          ✉️ Templates ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            activeTab === 'logs'
              ? 'bg-ink text-paper dark:bg-paper dark:text-ink'
              : 'text-ink/60 hover:text-ink hover:bg-field'
          }`}
        >
          📬 Delivery Outbox Log ({logs.length})
        </button>
      </div>

      {loading ? (
        <div className="p-12 space-y-3 animate-pulse bg-paper rounded-2xl border border-line">
          <div className="h-8 bg-field rounded-xl w-1/3" />
          <div className="h-12 bg-field rounded-xl" />
          <div className="h-12 bg-field rounded-xl" />
        </div>
      ) : (
        <>
          {/* Templates View */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              {templates.length === 0 ? (
                <div className="p-16 text-center text-xs text-ink/50 space-y-2 rounded-2xl border border-line bg-paper">
                  <span className="text-3xl block">✉️</span>
                  <p>No notification templates defined yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.key}
                      className="p-5 rounded-2xl border border-line bg-paper shadow-xs space-y-3 text-xs flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-ink text-sm">{tpl.key}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field border border-line">
                            Template
                          </span>
                        </div>

                        {tpl.subject && (
                          <div className="text-ink font-semibold text-xs border-b border-line pb-1.5">
                            <span className="text-ink/50 text-2xs uppercase block">Subject:</span>
                            {tpl.subject}
                          </div>
                        )}

                        <div>
                          <span className="text-ink/50 text-2xs uppercase block mb-1">
                            Message Body:
                          </span>
                          <pre className="font-mono text-2xs bg-field/60 p-2.5 rounded-xl border border-line whitespace-pre-wrap text-ink/80 max-h-32 overflow-y-auto">
                            {tpl.body}
                          </pre>
                        </div>

                        {tpl.variables?.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-1">
                            <span className="text-ink/40 text-2xs">Placeholders:</span>
                            {tpl.variables.map((v) => (
                              <span
                                key={v}
                                className="px-1.5 py-0.5 rounded bg-gold/10 text-gold-deep font-mono text-[9px]"
                              >
                                {`{{${v}}}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-line flex items-center justify-end">
                        <button
                          onClick={() => {
                            setEditingTemplate(tpl);
                            setIsTemplateModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-field hover:bg-gold/10 hover:text-gold-deep text-2xs font-bold transition-colors"
                        >
                          Edit Template ✏️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Logs View */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Filter Row */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink/60 font-semibold">Filter Status:</span>
                {['all', 'queued', 'sent', 'failed', 'failed_permanent'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setSelectedStatus(st)}
                    className={`px-3 py-1 rounded-lg text-2xs font-bold uppercase transition-colors ${
                      selectedStatus === st
                        ? 'bg-gold text-ink'
                        : 'bg-field hover:bg-field-hover text-ink/70'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Logs Table */}
              <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
                {logs.length === 0 ? (
                  <div className="p-16 text-center text-xs text-ink/50 space-y-2">
                    <span className="text-3xl block">📬</span>
                    <p>No outbox log entries found matching filter.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                          <th className="p-3">Notification Title</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Channel</th>
                          <th className="p-3">Recipient UID</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Attempts</th>
                          <th className="p-3">Timestamp</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {logs.map((log) => (
                          <tr key={log.id} className="hover:bg-field/30 transition-colors">
                            <td className="p-3 font-semibold text-ink">{log.title}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field border border-line">
                                {log.category}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field border border-line">
                                {log.channel}
                              </span>
                            </td>
                            <td className="p-3 text-ink/80 font-mono text-2xs">
                              {log.userId ? `${log.userId.slice(0, 10)}...` : '—'}
                            </td>
                            <td className="p-3">
                              <StatusChip status={log.status} />
                            </td>
                            <td className="p-3 font-mono text-ink/60 text-2xs">
                              {log.attempts || 0}
                            </td>
                            <td className="p-3 text-ink/60 font-mono text-2xs">
                              {formatISTDate(log.createdAt)}
                            </td>
                            <td className="p-3 text-right">
                              {log.status !== 'queued' && (
                                <button
                                  onClick={() => handleResend(log.id)}
                                  disabled={isResending === log.id}
                                  className="px-2.5 py-1 rounded bg-field hover:bg-gold/10 hover:text-gold-deep text-2xs font-bold transition-colors disabled:opacity-50"
                                >
                                  {isResending === log.id ? 'Re-queueing...' : 'Resend 🔁'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Template Edit Modal */}
      <AdminModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title={editingTemplate?.key ? `Edit ${editingTemplate.key}` : 'Create Notification Template'}
        description="Configure event key, email subject line, and message template."
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <FormField label="Template Event Key" hint="e.g. order.created, order.shipped" required>
            <input
              type="text"
              value={editingTemplate?.key || ''}
              onChange={(e) =>
                setEditingTemplate((p) => ({ ...p, key: e.target.value.toLowerCase() }))
              }
              placeholder="order.shipped"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <FormField label="Subject Line">
            <input
              type="text"
              value={editingTemplate?.subject || ''}
              onChange={(e) => setEditingTemplate((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Your BroPics order #{{orderId}} is on its way!"
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
            />
          </FormField>

          <FormField
            label="Template Body"
            hint="Supports {{variables}} such as {{orderId}}, {{customerName}}, {{trackingUrl}}"
            required
          >
            <textarea
              rows={6}
              value={editingTemplate?.body || ''}
              onChange={(e) => setEditingTemplate((p) => ({ ...p, body: e.target.value }))}
              placeholder="Hello {{customerName}}, your frame order #{{orderId}} has shipped..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
              required
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setIsTemplateModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingTemplate}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              {isSavingTemplate ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </form>
      </AdminModal>
    </div>
  );
}
