import React, { useMemo, useState } from 'react';
import { BookOpen, FileDown, MessageCircle, Plus, Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { saveSupplier } from '../../lib/erpService';
import { generateSupplierStatementPDF } from '../../lib/exportUtils';
import { formatDateDDMMYYYY, formatINR } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { Supplier } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const SuppliersView: React.FC = () => {
  const { profile, caps, lang, suppliers, purchases, payments, returns, settings } = useErp();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [ledgerSup, setLedgerSup] = useState<Supplier | null>(null);
  const [profileTab, setProfileTab] = useState<'ledger' | 'purchases' | 'payments' | 'returns'>('ledger');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    whatsapp: '',
    address: '',
    gstin: '',
    openingBalance: 0,
    status: 'active' as 'active' | 'inactive',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          (s.whatsapp || '').toLowerCase().includes(q) ||
          (s.contactPerson || '').toLowerCase().includes(q) ||
          (s.gstin || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, search]);

  const openAdd = () => {
    setEditing(null);
    setErr(null);
    setForm({
      name: '',
      contactPerson: '',
      phone: '',
      whatsapp: '',
      address: '',
      gstin: '',
      openingBalance: 0,
      status: 'active',
    });
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setErr(null);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson || '',
      phone: s.phone,
      whatsapp: s.whatsapp || '',
      address: s.address || '',
      gstin: s.gstin || '',
      openingBalance: s.openingBalance,
      status: s.status,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setErr(null);
    try {
      await saveSupplier(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        { id: editing?.id, ...form },
        !editing
      );
      setModalOpen(false);
    } catch (saveErr) {
      setErr(saveErr instanceof Error ? saveErr.message : 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const supPurchases = useMemo(() => {
    if (!ledgerSup) return [];
    return purchases
      .filter((p) => p.supplierId === ledgerSup.id && p.status !== 'reversed')
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [ledgerSup, purchases]);

  const supPayments = useMemo(() => {
    if (!ledgerSup) return [];
    return payments
      .filter((p) => p.partyType === 'supplier' && p.partyId === ledgerSup.id && p.status === 'active')
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [ledgerSup, payments]);

  const supReturns = useMemo(() => {
    if (!ledgerSup) return [];
    return returns
      .filter((r) => r.returnType === 'supplier_return' && r.partyId === ledgerSup.id && r.status === 'completed')
      .sort((a, b) => b.returnDate.localeCompare(a.returnDate));
  }, [ledgerSup, returns]);

  const supLedgerRows = useMemo(() => {
    if (!ledgerSup) return [];
    const entries: Array<{
      date: string;
      type: string;
      ref: string;
      debit: number;
      credit: number;
    }> = [];
    for (const p of supPurchases) {
      entries.push({
        date: p.purchaseDate,
        type: p.purchaseType === 'direct_to_shop' ? 'Direct Purchase' : 'Warehouse Purchase',
        ref: p.invoiceNumber,
        credit: p.totalCost,
        debit: 0,
      });
    }
    for (const pay of supPayments) {
      entries.push({
        date: pay.paymentDate,
        type: `Payment (${pay.method.toUpperCase()})`,
        ref: pay.receiptNumber,
        debit: pay.paymentKind === 'refund' ? 0 : pay.amount,
        credit: pay.paymentKind === 'refund' ? pay.amount : 0,
      });
    }
    for (const ret of supReturns) {
      entries.push({
        date: ret.returnDate,
        type: 'Purchase Return',
        ref: ret.returnNumber,
        debit: ret.totalValue,
        credit: 0,
      });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));
    let running = ledgerSup.openingBalance;
    return entries.map((en) => {
      running = running + en.credit - en.debit;
      return { ...en, balance: running };
    });
  }, [ledgerSup, supPurchases, supPayments, supReturns]);

  const openWhatsApp = (s: Supplier) => {
    const raw = (s.whatsapp || s.phone || '').replace(/\D/g, '');
    const phone = raw.length === 10 ? `91${raw}` : raw;
    const msg = encodeURIComponent(
      `Hello ${s.contactPerson || s.name}, message from Pramanik Digital Point (Singda, Dantan | Ph: 95933 53980).`
    );
    window.open(phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier name, phone, WhatsApp, GSTIN..."
            className="w-72 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-violet-600 focus:outline-none"
          />
        </div>
        {caps.canManageSuppliers && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Supplier</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Contact & GSTIN</th>
              {caps.canViewSupplierFinancials && (
                <>
                  <th className="px-4 py-3 text-right font-medium">Opening Bal</th>
                  <th className="px-4 py-3 text-right font-medium">Total Purchases</th>
                  <th className="px-4 py-3 text-right font-medium">Payments Made</th>
                  <th className="px-4 py-3 text-right font-medium">Outstanding Payable</th>
                </>
              )}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {t(lang, 'no_records')}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.name}</div>
                    <div className="text-[11px] text-slate-500">{s.address || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>
                      {s.contactPerson || '-'} · <span className="font-mono">{s.phone}</span>
                      {s.whatsapp && s.whatsapp !== s.phone ? (
                        <span className="ml-1 font-mono text-[11px] text-emerald-700">
                          (WA: {s.whatsapp})
                        </span>
                      ) : null}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {s.gstin ? `GSTIN: ${s.gstin}` : 'Unregistered'}
                    </div>
                  </td>
                  {caps.canViewSupplierFinancials && (
                    <>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                        {formatINR(s.openingBalance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                        {formatINR(s.totalPurchases)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                        {formatINR(s.totalPayments)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                        {formatINR(s.outstandingPayable)}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <span className={s.status === 'active' ? 'text-emerald-700' : 'text-slate-400'}>
                      {s.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openWhatsApp(s)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                        title="Message on WhatsApp"
                      >
                        <MessageCircle className="h-3 w-3" />
                        <span>WA</span>
                      </button>
                      {caps.canViewSupplierFinancials && (
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerSup(s);
                            setProfileTab('ledger');
                          }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
                        >
                          <BookOpen className="h-3 w-3" />
                          <span>Profile & Ledger</span>
                        </button>
                      )}
                      {caps.canManageSuppliers && (
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="whitespace-nowrap rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Supplier Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Supplier: ${editing.name}` : 'Add New Supplier'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Supplier Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Contact Person</label>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Phone Number *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">WhatsApp Number</label>
              <input
                type="text"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">GSTIN (Optional)</label>
              <input
                type="text"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Previous / Opening Payable (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Profile & Ledger Modal */}
      <Modal
        open={Boolean(ledgerSup)}
        onClose={() => setLedgerSup(null)}
        title={`Supplier Profile & Ledger — ${ledgerSup?.name || ''}`}
        subtitle={`Opening Payable: ${formatINR(ledgerSup?.openingBalance || 0)} · Closing Payable: ${formatINR(ledgerSup?.outstandingPayable || 0)}`}
        size="xl"
      >
        {ledgerSup && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-5">
                <div>
                  <div className="text-[11px] text-slate-500">Total Purchases</div>
                  <div className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR(ledgerSup.totalPurchases)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Payments Made</div>
                  <div className="font-mono font-bold text-emerald-700 tabular-nums">
                    {formatINR(ledgerSup.totalPayments)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Outstanding Payable</div>
                  <div className="font-mono font-bold text-red-700 tabular-nums">
                    {formatINR(ledgerSup.outstandingPayable)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  generateSupplierStatementPDF(ledgerSup, purchases, payments, returns, settings)
                }
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-700"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Download Statement PDF</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setProfileTab('ledger')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'ledger'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Running Ledger ({supLedgerRows.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('purchases')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'purchases'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Purchases ({supPurchases.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('payments')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'payments'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Payments ({supPayments.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('returns')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'returns'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Returns ({supReturns.length})
              </button>
            </div>

            {profileTab === 'ledger' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Particulars</th>
                      <th className="px-3 py-2 font-medium">Ref No</th>
                      <th className="px-3 py-2 text-right font-medium">Purchases (+)</th>
                      <th className="px-3 py-2 text-right font-medium">Paid / Return (-)</th>
                      <th className="px-3 py-2 text-right font-medium">Running Payable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-3 py-2 text-slate-500">-</td>
                      <td className="px-3 py-2 font-medium text-slate-700">Opening Balance</td>
                      <td className="px-3 py-2">-</td>
                      <td className="px-3 py-2 text-right font-mono">-</td>
                      <td className="px-3 py-2 text-right font-mono">-</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatINR(ledgerSup.openingBalance)}
                      </td>
                    </tr>
                    {supLedgerRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {formatDateDDMMYYYY(r.date)}
                        </td>
                        <td className="px-3 py-2 text-slate-800">{r.type}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{r.ref}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-900 tabular-nums">
                          {r.credit > 0 ? formatINR(r.credit) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700 tabular-nums">
                          {r.debit > 0 ? formatINR(r.debit) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatINR(r.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'purchases' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Invoice No</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 text-right font-medium">Total Cost</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-right font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supPurchases.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          No purchase invoices found.
                        </td>
                      </tr>
                    ) : (
                      supPurchases.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(p.purchaseDate)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {p.invoiceNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {p.purchaseType === 'direct_to_shop'
                              ? `Direct -> ${p.targetShopName || ''}`
                              : 'Warehouse'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatINR(p.totalCost)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700 tabular-nums">
                            {formatINR(p.amountPaid)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-red-700 tabular-nums">
                            {formatINR(p.remainingDue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'payments' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Receipt</th>
                      <th className="px-3 py-2 font-medium">Method / Ref</th>
                      <th className="px-3 py-2 font-medium">Linked Bill</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supPayments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          No supplier payments recorded.
                        </td>
                      </tr>
                    ) : (
                      supPayments.map((pay) => (
                        <tr key={pay.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(pay.paymentDate)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {pay.receiptNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {pay.method.toUpperCase()} {pay.referenceNo ? `· ${pay.referenceNo}` : ''}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {pay.linkedInvoiceNo || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {formatINR(pay.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'returns' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Return No</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supReturns.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          No supplier returns recorded.
                        </td>
                      </tr>
                    ) : (
                      supReturns.map((ret) => (
                        <tr key={ret.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(ret.returnDate)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {ret.returnNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-800">{ret.productName}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{ret.qty}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                            {formatINR(ret.totalValue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
