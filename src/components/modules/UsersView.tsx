import React, { useMemo, useState } from 'react';
import { Plus, Shield, UserCheck } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { saveStaffInvite, updateStaffUser } from '../../lib/erpService';
import { formatTimestampIST } from '../../lib/formatters';
import { ROLE_CAPABILITIES } from '../../lib/permissions';
import type { UserProfile, UserRole } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const UsersView: React.FC = () => {
  const { profile, users, staffInvites, auditLogs } = useErp();
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    displayName: '',
    phone: '',
    role: 'sales' as UserRole,
    active: true,
  });

  const [editForm, setEditForm] = useState({
    displayName: '',
    phone: '',
    role: 'sales' as UserRole,
    active: true,
  });

  const sortedAudit = useMemo(
    () =>
      auditLogs
        .slice()
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [auditLogs]
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setErr(null);
    try {
      await saveStaffInvite(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        inviteForm
      );
      setInviteOpen(false);
      setInviteForm({ email: '', displayName: '', phone: '', role: 'sales', active: true });
    } catch (invErr) {
      setErr(invErr instanceof Error ? invErr.message : 'Failed to invite staff.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editUser) return;
    setSaving(true);
    setErr(null);
    try {
      await updateStaffUser(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        editUser,
        editForm
      );
      setEditUser(null);
    } catch (uErr) {
      setErr(uErr instanceof Error ? uErr.message : 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === 'users' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Users & Role Permissions
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === 'audit' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Activity & Audit Log ({auditLogs.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setErr(null);
            setInviteOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Invite Staff User</span>
        </button>
      </div>

      {tab === 'users' ? (
        <div className="space-y-5">
          {/* Active Registered Users */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-900">
              <UserCheck className="h-4 w-4 text-blue-600" />
              <span>Active & Registered User Accounts ({users.length})</span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name & Email</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{u.displayName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{u.phone || '-'}</td>
                    <td className="px-4 py-3 font-medium text-blue-700">
                      {ROLE_CAPABILITIES[u.role]?.label || u.role}
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.active ? 'text-emerald-700' : 'text-red-600'}>
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditUser(u);
                          setEditForm({
                            displayName: u.displayName,
                            phone: u.phone || '',
                            role: u.role,
                            active: u.active,
                          });
                        }}
                        className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                      >
                        Edit / Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pending / Configured Invites */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-900">
              <Shield className="h-4 w-4 text-slate-500" />
              <span>Authorized Staff Email Invitations ({staffInvites.length})</span>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Staff Name</th>
                  <th className="px-4 py-2.5 font-medium">Google Email</th>
                  <th className="px-4 py-2.5 font-medium">Assigned Role</th>
                  <th className="px-4 py-2.5 font-medium">Invite Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffInvites.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No staff invitations created yet. Click &ldquo;Invite Staff User&rdquo; to authorize a Manager, Sales Staff, Accounts Staff, or Stock Manager.
                    </td>
                  </tr>
                ) : (
                  staffInvites.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{inv.displayName}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{inv.email}</td>
                      <td className="px-4 py-2.5 text-blue-700">
                        {ROLE_CAPABILITIES[inv.role]?.label || inv.role}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={inv.active ? 'text-emerald-700' : 'text-slate-400'}>
                          {inv.active ? 'Authorized' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Time (IST)</th>
                <th className="px-4 py-3 font-medium">User & Role</th>
                <th className="px-4 py-3 font-medium">Module / Action</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAudit.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 tabular-nums">
                    {formatTimestampIST(a.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{a.userName}</div>
                    <div className="text-[11px] text-slate-400">{a.userRole}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[11px] font-semibold text-blue-700">
                      {a.action}
                    </div>
                    <div className="text-[11px] text-slate-400">{a.module}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Authorize New Staff User"
        subtitle="When this staff member signs in with Google using this email, their role is automatically provisioned."
        size="md"
      >
        <form onSubmit={handleInvite} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}
          <div>
            <label className="mb-1 block font-medium text-slate-700">Staff Google Email *</label>
            <input
              type="email"
              required
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              placeholder="staff.member@gmail.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Full Name *</label>
            <input
              type="text"
              required
              value={inviteForm.displayName}
              onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Phone</label>
            <input
              type="text"
              value={inviteForm.phone}
              onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Assigned Role *</label>
            <select
              value={inviteForm.role}
              onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as UserRole })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="manager">Manager</option>
              <option value="sales">Sales Staff</option>
              <option value="accounts">Accounts Staff</option>
              <option value="stock">Stock Manager</option>
              <option value="owner">Owner / Super Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
            >
              {saving ? 'Saving...' : 'Authorize Email'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Registered User Modal */}
      <Modal
        open={Boolean(editUser)}
        onClose={() => setEditUser(null)}
        title={`Manage User — ${editUser?.email || ''}`}
        size="md"
      >
        <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
          <div>
            <label className="mb-1 block font-medium text-slate-700">Display Name *</label>
            <input
              type="text"
              required
              value={editForm.displayName}
              onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Phone</label>
            <input
              type="text"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="owner">Owner / Super Admin</option>
              <option value="manager">Manager</option>
              <option value="sales">Sales Staff</option>
              <option value="accounts">Accounts Staff</option>
              <option value="stock">Stock Manager</option>
            </select>
          </div>
          <label className="flex items-center gap-2 font-medium text-slate-700">
            <input
              type="checkbox"
              checked={editForm.active}
              onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
            />
            <span>Account Active</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditUser(null)}
              className="rounded-lg border border-slate-200 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
            >
              {saving ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
