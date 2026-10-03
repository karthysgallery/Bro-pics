'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../../lib/auth-context';
import { AdminModal, ConfirmModal } from '../../../../components/admin/AdminModal';
import { FormField } from '../../../../components/admin/AdminForm';
import { useToast } from '../../../../components/ui/Toast';
import { ROLES, type Role, ROLE_PERMISSIONS } from '@bro-pics/shared';

interface StaffMember {
  uid: string;
  role: Role;
  active: boolean;
  invitedBy?: string;
  lastLoginAt?: unknown;
  updatedAt?: unknown;
}

interface LookupUser {
  uid: string;
  phoneNumber?: string;
  email?: string;
  displayName?: string;
  role: string | null;
}

function formatISTDate(dateVal: unknown): string {
  if (!dateVal) return 'Never / Unknown';
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
  if (isNaN(d.getTime())) return 'Never / Unknown';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ROLE_LABELS: Record<Role, { title: string; desc: string; badge: string }> = {
  super_admin: {
    title: 'Super Admin',
    desc: 'Unrestricted access across the entire organization, team management & revenue controls.',
    badge: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  },
  admin: {
    title: 'Administrator',
    desc: 'Full access to catalogue, orders, content, marketing, and settings (excluding team management).',
    badge: 'bg-gold/10 text-gold-deep border-gold/30',
  },
  staff: {
    title: 'Fulfillment & Ops Staff',
    desc: 'Manage orders, update tracking AWBs, inspect QC, advance status, and moderate customer reviews.',
    badge: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  },
  marketing_manager: {
    title: 'Marketing Manager',
    desc: 'Manage coupons, review moderation, promotional banners, and storefront merchandising.',
    badge: 'bg-teal-500/10 text-teal-600 border-teal-500/30',
  },
  content_manager: {
    title: 'Content Manager',
    desc: 'Manage homepage sections, static CMS policy pages, FAQs, testimonials, and videos.',
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  },
  catalogue_manager: {
    title: 'Catalogue Manager',
    desc: 'Manage products, variant matrices, frame templates, categories, and stock inventory levels.',
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  },
};

export default function AdminTeamSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('staff');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [createdInviteToken, setCreatedInviteToken] = useState<string | null>(null);

  // Edit role modal state
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | 'remove'>('staff');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Disable / enable modal state
  const [togglingMember, setTogglingMember] = useState<StaffMember | null>(null);
  const [isTogglingDisable, setIsTogglingDisable] = useState(false);

  // Direct user lookup state
  const [lookupPhone, setLookupPhone] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupUser | null>(null);
  const [lookupRole, setLookupRole] = useState<Role>('staff');
  const [isSavingLookupRole, setIsSavingLookupRole] = useState(false);

  // Permissions matrix drawer/accordion
  const [showMatrix, setShowMatrix] = useState(false);

  // Fetch staff directory
  const fetchStaff = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/staff', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load team staff directory');
      const data = await res.json();
      setStaffList(data.staff || []);
    } catch {
      showToast('Error loading team directory', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [user]);

  // Handle Invite
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !inviteEmail.trim()) return;
    setIsSendingInvite(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/staff/invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || 'Failed to generate invite');
      }

      const d = await res.json();
      setCreatedInviteToken(d.token);
      showToast(`Invite generated for ${inviteEmail}`, 'success');
      fetchStaff();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error generating invite', 'error');
    } finally {
      setIsSendingInvite(false);
    }
  };

  // Handle Role Update
  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingMember) return;
    setIsUpdatingRole(true);
    try {
      const token = await user.getIdToken();
      const newRole = selectedRole === 'remove' ? null : selectedRole;
      const res = await fetch(`/api/admin/users/${editingMember.uid}/role`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || 'Failed to update role');
      }

      showToast('User role updated successfully', 'success');
      setEditingMember(null);
      fetchStaff();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error updating user role', 'error');
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Handle Toggle Disable
  const handleToggleDisable = async () => {
    if (!user || !togglingMember) return;
    setIsTogglingDisable(true);
    try {
      const token = await user.getIdToken();
      const newDisabledState = togglingMember.active; // If currently active, set disabled to true
      const res = await fetch(`/api/admin/staff/${togglingMember.uid}/disable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ disabled: newDisabledState }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || 'Failed to update staff status');
      }

      showToast(
        newDisabledState ? 'Staff member access disabled' : 'Staff member access re-enabled',
        'success'
      );
      setTogglingMember(null);
      fetchStaff();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error updating staff status', 'error');
    } finally {
      setIsTogglingDisable(false);
    }
  };

  // Handle Direct User Phone Lookup
  const handleLookupUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !lookupPhone.trim()) return;
    setIsLookingUp(true);
    setLookupResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/users/lookup?phone=${encodeURIComponent(lookupPhone.trim())}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error('No user account found with that phone number');
      }

      const d = await res.json();
      setLookupResult(d);
      if (d.role && ROLES.includes(d.role as Role)) {
        setLookupRole(d.role as Role);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lookup failed', 'error');
    } finally {
      setIsLookingUp(false);
    }
  };

  // Save Lookup User Role
  const handleSaveLookupRole = async () => {
    if (!user || !lookupResult) return;
    setIsSavingLookupRole(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/users/${lookupResult.uid}/role`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: lookupRole }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || 'Failed to assign role');
      }

      showToast(`Assigned ${lookupRole} role to user`, 'success');
      setLookupResult(null);
      setLookupPhone('');
      fetchStaff();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error assigning role', 'error');
    } finally {
      setIsSavingLookupRole(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
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
            Team & Role Permissions
          </h1>
          <p className="text-xs text-ink/60">
            Manage staff members, invite collaborators, and configure granular role-based access control (RBAC).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMatrix(!showMatrix)}
            className="px-3.5 py-2 rounded-xl bg-field hover:bg-field-hover border border-line text-xs font-bold text-ink transition-colors"
          >
            {showMatrix ? 'Hide RBAC Matrix' : 'View Permissions Matrix 📋'}
          </button>
          <button
            onClick={() => {
              setInviteEmail('');
              setInviteRole('staff');
              setCreatedInviteToken(null);
              setIsInviteModalOpen(true);
            }}
            className="px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            + Invite Staff Member
          </button>
        </div>
      </div>

      {/* Permissions Matrix Drawer/Card */}
      {showMatrix && (
        <div className="p-6 rounded-2xl border border-gold/30 bg-gold/5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-2">
              <span>🔐</span> Role-Based Access Control (RBAC) Matrix
            </h2>
            <button
              onClick={() => setShowMatrix(false)}
              className="text-xs text-ink/60 hover:text-ink font-bold"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {ROLES.map((r) => (
              <div key={r} className="p-3.5 rounded-xl border border-line bg-paper text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${ROLE_LABELS[r].badge}`}>
                    {ROLE_LABELS[r].title}
                  </span>
                </div>
                <p className="text-ink/70 text-2xs">{ROLE_LABELS[r].desc}</p>
                <div className="pt-2 border-t border-line">
                  <span className="text-2xs font-semibold text-ink/50 uppercase block mb-1">
                    Permissions ({ROLE_PERMISSIONS[r].length}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ROLE_PERMISSIONS[r].map((perm) => (
                      <span
                        key={perm}
                        className="px-1.5 py-0.5 rounded bg-field text-ink/70 font-mono text-[9px]"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Staff Directory Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider">
            Active Staff Directory ({staffList.length})
          </h2>
        </div>

        <div className="rounded-2xl border border-line bg-paper shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 space-y-3 animate-pulse">
              <div className="h-8 bg-field rounded-xl w-1/3" />
              <div className="h-10 bg-field rounded-xl" />
              <div className="h-10 bg-field rounded-xl" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="p-16 text-center text-xs text-ink/50 space-y-2">
              <span className="text-3xl block">👥</span>
              <p>No staff accounts registered yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-field/70 border-b border-line text-2xs uppercase tracking-wider text-ink/60 font-semibold">
                    <th className="p-3">Staff UID / Identifier</th>
                    <th className="p-3">Assigned Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Last Login (IST)</th>
                    <th className="p-3">Invited By</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {staffList.map((m) => (
                    <tr key={m.uid} className="hover:bg-field/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-ink">
                        {m.uid === user?.uid ? (
                          <span className="flex items-center gap-1.5 text-gold-deep">
                            {m.uid.slice(0, 10)}... (You)
                          </span>
                        ) : (
                          `${m.uid.slice(0, 10)}...`
                        )}
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                            ROLE_LABELS[m.role]?.badge || 'bg-field text-ink border-line'
                          }`}
                        >
                          {ROLE_LABELS[m.role]?.title || m.role}
                        </span>
                      </td>

                      <td className="p-3">
                        {m.active ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-red-500/10 text-red-500 border border-red-500/30">
                            Disabled
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-ink/60 font-mono text-2xs">
                        {formatISTDate(m.lastLoginAt)}
                      </td>

                      <td className="p-3 font-mono text-ink/50 text-2xs">
                        {m.invitedBy ? `${m.invitedBy.slice(0, 8)}...` : 'System'}
                      </td>

                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingMember(m);
                            setSelectedRole(m.role);
                          }}
                          className="px-2.5 py-1 rounded bg-field hover:bg-gold/10 hover:text-gold-deep text-2xs font-bold transition-colors"
                        >
                          Change Role ✏️
                        </button>

                        {m.uid !== user?.uid && (
                          <button
                            onClick={() => setTogglingMember(m)}
                            className={`px-2.5 py-1 rounded text-2xs font-bold transition-colors ${
                              m.active
                                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                            }`}
                          >
                            {m.active ? 'Disable' : 'Enable'}
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

      {/* Direct User Phone Lookup & Role Assignment */}
      <div className="p-6 rounded-2xl border border-line bg-paper shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-2 flex items-center gap-2">
          <span>🔍</span> Look up Existing User Account by Phone
        </h2>
        <p className="text-xs text-ink/60">
          Find any existing customer or staff member by their registered phone number to directly update their staff role.
        </p>

        <form onSubmit={handleLookupUser} className="flex gap-2 max-w-md">
          <input
            type="text"
            value={lookupPhone}
            onChange={(e) => setLookupPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="flex-1 px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink font-mono focus:border-gold focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={isLookingUp}
            className="px-4 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {isLookingUp ? 'Searching...' : 'Search User'}
          </button>
        </form>

        {lookupResult && (
          <div className="p-4 rounded-xl border border-gold/30 bg-gold/5 space-y-3 text-xs max-w-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-ink">
                  {lookupResult.displayName || 'Registered User'}
                </div>
                <div className="text-ink/60 font-mono text-2xs">
                  {lookupResult.phoneNumber || lookupResult.email || lookupResult.uid}
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-field border border-line">
                Current: {lookupResult.role || 'customer'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-gold/20">
              <select
                value={lookupRole}
                onChange={(e) => setLookupRole(e.target.value as Role)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r].title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveLookupRole}
                disabled={isSavingLookupRole}
                className="px-3 py-1.5 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSavingLookupRole ? 'Saving...' : 'Grant Role'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Staff Modal */}
      <AdminModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite New Staff Member"
        description="Generate an invitation token for a teammate to join with pre-assigned role permissions."
      >
        {createdInviteToken ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2 text-xs">
              <span className="text-emerald-600 font-bold block">
                ✓ Staff Invitation Created Successfully!
              </span>
              <p className="text-ink/80">
                Share this secure invitation token or onboarding link with{' '}
                <strong className="font-mono text-ink">{inviteEmail}</strong>:
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  readOnly
                  value={createdInviteToken}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-line bg-paper font-mono text-ink select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(createdInviteToken);
                    showToast('Invite token copied to clipboard', 'success');
                  }}
                  className="px-3 py-2 bg-gold hover:bg-gold-deep text-ink text-xs font-bold rounded-xl transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="px-4 py-2 bg-field hover:bg-field-hover text-ink text-xs font-bold rounded-xl border border-line transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4">
            <FormField label="Teammate Email Address" required>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@bropics.com"
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
                required
              />
            </FormField>

            <FormField label="Assigned RBAC Role" required>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r].title} — {ROLE_LABELS[r].desc}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingInvite}
                className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
              >
                {isSendingInvite ? 'Generating...' : 'Generate Invite'}
              </button>
            </div>
          </form>
        )}
      </AdminModal>

      {/* Edit Role Modal */}
      <AdminModal
        isOpen={!!editingMember}
        onClose={() => setEditingMember(null)}
        title="Update Staff Role"
        description={`Modify role privileges for staff UID ${editingMember?.uid.slice(0, 12)}...`}
      >
        <form onSubmit={handleUpdateRole} className="space-y-4">
          <FormField label="Select Role" required>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as Role | 'remove')}
              className="w-full px-3 py-2 text-xs rounded-xl border border-line bg-paper text-ink focus:border-gold focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r].title}
                </option>
              ))}
              <option value="remove">🚫 Revoke All Staff Privileges (Demote to Customer)</option>
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-line">
            <button
              type="button"
              onClick={() => setEditingMember(null)}
              className="px-4 py-2 rounded-xl border border-line bg-field hover:bg-field-hover text-ink text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdatingRole}
              className="px-4 py-2 rounded-xl bg-gold hover:bg-gold-deep text-ink text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
            >
              {isUpdatingRole ? 'Updating...' : 'Save Role'}
            </button>
          </div>
        </form>
      </AdminModal>

      {/* Disable / Enable Confirmation Modal */}
      <ConfirmModal
        isOpen={!!togglingMember}
        onClose={() => setTogglingMember(null)}
        onConfirm={handleToggleDisable}
        title={togglingMember?.active ? 'Disable Staff Access' : 'Re-enable Staff Access'}
        message={
          togglingMember?.active
            ? `Are you sure you want to disable UID ${togglingMember?.uid.slice(0, 10)}...? All active sessions will be terminated.`
            : `Are you sure you want to re-enable UID ${togglingMember?.uid.slice(0, 10)}...?`
        }
        confirmText={
          isTogglingDisable
            ? 'Processing...'
            : togglingMember?.active
            ? 'Disable Staff Member'
            : 'Re-enable Staff Member'
        }
        variant={togglingMember?.active ? 'danger' : 'primary'}
      />
    </div>
  );
}
