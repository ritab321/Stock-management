import React, { useMemo, useState } from 'react';
import { BookOpen, Plus, Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { saveShop } from '../../lib/erpService';
import { formatDateDDMMYYYY, formatINR } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { Shop } from '../../types/erp';
import { Modal } from '../ui/Modal';

const PASCHIM_MEDINIPUR_BLOCKS = [
  'Dantan-I',
  'Dantan-II',
  'Mohanpur',
  'Keshiary',
  'Narayangarh',
  'Kharagpur-I',
  'Kharagpur-II',
  'Sabang',
  'Pingla',
  'Debra',
  'Medinipur Sadar',
  'Salboni',
  'Ghatal',
  'Daspur-I',
  'Garhbeta-I',
];

export const ShopsView: React.FC = () => {
  const { profile, caps, lang, shops, sales, payments, returns } = useErp();
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [ledgerShop, setLedgerShop] = useState<Shop | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    shopName: '',
    ownerName: '',
    mobile: '',
    whatsapp: '',
    address: '',
    villageTown: '',
    blockArea: 'Dantan-I',
    district: 'Paschim Medinipur',
    route: 'NH-16 Dantan-Belda Route',
    openingBalance: 0,
    creditLimit: 20000,
    status: 'active' as 'active' | 'inactive',
  });

  const blocks = useMemo(
    () => Array.from(new Set(shops.map((s) => s.blockArea).filter(Boolean))).sort(),
    [shops]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shops
      .filter((s) => {
        if (blockFilter !== 'all' && s.blockArea !== blockFilter) return false;
        if (!q) return true;
        return (
          s.shopName.toLowerCase().includes(q) ||
          s.ownerName.toLowerCase().includes(q) ||
          s.mobile.toLowerCase().includes(q) ||
          s.villageTown.toLowerCase().includes(q) ||
          s.blockArea.toLowerCase().includes(q) ||
          s.district.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.shopName.localeCompare(b.shopName));
  }, [shops, search, blockFilter]);

  const openAdd = () => {
    setEditing(null);
    setErr(null);
    setForm({
      shopName: '',
      ownerName: '',
      mobile: '',
      whatsapp: '',
      address: '',
      villageTown: '',
      blockArea: 'Dantan-I',
      district: 'Paschim Medinipur',
      route: 'NH-16 Dantan-Belda Route',
      openingBalance: 0,
      creditLimit: 20000,
      status: 'active',
    });
    setModalOpen(true);
  };

  const openEdit = (s: Shop) => {
    setEditing(s);
    setErr(null);
    setForm({
      shopName: s.shopName,
      ownerName: s.ownerName,
      mobile: s.mobile,
      whatsapp: s.whatsapp || '',
      address: s.address || '',
      villageTown: s.villageTown,
      blockArea: s.blockArea,
      district: s.district,
      route: s.route || '',
      openingBalance: s.openingBalance,
      creditLimit: s.creditLimit,
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
      await saveShop(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        { id: editing?.id, ...form },
        !editing
      );
      setModalOpen(false);
    } catch (saveErr) {
      setErr(saveErr instanceof Error ? saveErr.message : 'Failed to save shop.');
    } finally {
      setSaving(false);
    }
  };

  const ledgerRows = useMemo(() => {
    if (!ledgerShop) return [];
    const items: Array<{ date: string; type: string; ref: string; debit: number; credit: number }> = [];
    for (const s of sales) {
      if (s.shopId === ledgerShop.id && s.deliveryStatus !== 'reversed') {
        items.push({
          date: s.saleDate,
          type:
            s.deliveryMethod === 'warehouse_dispatch'
              ? 'Warehouse Dispatch'
              : 'Direct Supplier Dispatch',
          ref: s.invoiceNumber,
          debit: s.netTotal,
          credit: 0,
        });
      }
    }
    for (const p of payments) {
      if (p.partyType === 'shop' && p.partyId === ledgerShop.id && p.status === 'active') {
        items.push({
          date: p.paymentDate,
          type: p.paymentKind === 'credit_note' ? 'Credit Note' : `Payment (${p.method.toUpperCase()})`,
          ref: p.receiptNumber,
          debit: p.paymentKind === 'refund' ? p.amount : 0,
          credit: p.paymentKind === 'refund' ? 0 : p.amount,
        });
      }
    }
    for (const r of returns) {
      if (r.returnType === 'shop_return' && r.partyId === ledgerShop.id && r.status === 'completed') {
        items.push({
          date: r.returnDate,
          type: 'Shop Return',
          ref: r.returnNumber,
          debit: 0,
          credit: r.totalValue,
        });
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    let running = ledgerShop.openingBalance;
    return items.map((it) => {
      running = running + it.debit - it.credit;
      return { ...it, balance: running };
    });
  }, [ledgerShop, sales, payments, returns]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shop, phone, village, block, district..."
              className="w-72 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select
            value={blockFilter}
            onChange={(e) => setBlockFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Blocks / Areas</option>
            {blocks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {caps.canManageShops && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Shop</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Shop & Owner</th>
              <th className="px-4 py-3 font-medium">Location (Paschim Medinipur)</th>
              <th className="px-4 py-3 text-right font-medium">Credit Limit</th>
              <th className="px-4 py-3 text-right font-medium">Total Purchases</th>
              <th className="px-4 py-3 text-right font-medium">Total Payments</th>
              <th className="px-4 py-3 text-right font-medium">Outstanding</th>
              <th className="px-4 py-3 font-medium">Last Delivery</th>
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
              filtered.map((s) => {
                const overLimit = s.creditLimit > 0 && s.currentOutstanding > s.creditLimit;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{s.shopName}</div>
                      <div className="text-[11px] text-slate-500">
                        {s.ownerName} · <span className="font-mono">{s.mobile}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>
                        {s.villageTown}, {s.blockArea}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {s.district}
                        {s.route ? ` · ${s.route}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                      {formatINR(s.creditLimit)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900 tabular-nums">
                      {formatINR(s.totalPurchases)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                      {formatINR(s.totalPayments)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className={`font-semibold ${overLimit ? 'text-red-600' : 'text-amber-700'}`}>
                        {formatINR(s.currentOutstanding)}
                      </span>
                      {overLimit && (
                        <div className="text-[10px] font-semibold text-red-600">Limit Exceeded</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {formatDateDDMMYYYY(s.lastDeliveryDate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLedgerShop(s)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                        >
                          <BookOpen className="h-3 w-3" />
                          <span>Ledger</span>
                        </button>
                        {caps.canManageShops && (
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Shop Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Shop: ${editing.shopName}` : 'Add Retail Shop / Customer'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Shop Name *</label>
              <input
                type="text"
                required
                value={form.shopName}
                onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Owner Name *</label>
              <input
                type="text"
                required
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Mobile Number *</label>
              <input
                type="text"
                required
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
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
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Street / Market Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Village / Town *</label>
              <input
                type="text"
                required
                value={form.villageTown}
                onChange={(e) => setForm({ ...form, villageTown: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Block / Area *</label>
              <input
                list="pm-blocks"
                required
                value={form.blockArea}
                onChange={(e) => setForm({ ...form, blockArea: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
              <datalist id="pm-blocks">
                {PASCHIM_MEDINIPUR_BLOCKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">District *</label>
              <input
                type="text"
                required
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Delivery Route</label>
              <input
                type="text"
                value={form.route}
                onChange={(e) => setForm({ ...form, route: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Opening Balance (₹)</label>
              <input
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Credit Limit (₹)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
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
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Shop Quick Ledger Modal */}
      <Modal
        open={Boolean(ledgerShop)}
        onClose={() => setLedgerShop(null)}
        title={`Customer Ledger — ${ledgerShop?.shopName || ''}`}
        subtitle={`Opening Balance: ${formatINR(ledgerShop?.openingBalance || 0)} · Closing Outstanding: ${formatINR(ledgerShop?.currentOutstanding || 0)}`}
        size="xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Particulars</th>
                <th className="px-3 py-2 font-medium">Ref No</th>
                <th className="px-3 py-2 text-right font-medium">Debit (+)</th>
                <th className="px-3 py-2 text-right font-medium">Credit (-)</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2 text-slate-500">-</td>
                <td className="px-3 py-2 font-medium text-slate-700">Opening Balance</td>
                <td className="px-3 py-2">-</td>
                <td className="px-3 py-2 text-right font-mono">-</td>
                <td className="px-3 py-2 text-right font-mono">-</td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                  {formatINR(ledgerShop?.openingBalance || 0)}
                </td>
              </tr>
              {ledgerRows.map((r, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 font-mono text-slate-600">{formatDateDDMMYYYY(r.date)}</td>
                  <td className="px-3 py-2 text-slate-800">{r.type}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{r.ref}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-900">
                    {r.debit > 0 ? formatINR(r.debit) : '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-700">
                    {r.credit > 0 ? formatINR(r.credit) : '-'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                    {formatINR(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
};
