import React, { useMemo, useState } from 'react';
import { BookOpen, FileDown, MessageCircle, Plus, Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { saveShop } from '../../lib/erpService';
import { generateShopLedgerPDF } from '../../lib/exportUtils';
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
  const {
    profile,
    caps,
    lang,
    shops,
    sales,
    saleItems,
    invoices,
    invoiceItems,
    payments,
    returns,
    settings,
  } = useErp();

  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState('all');
  const [townFilter, setTownFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shop | null>(null);
  const [ledgerShop, setLedgerShop] = useState<Shop | null>(null);
  const [profileTab, setProfileTab] = useState<'ledger' | 'bills' | 'payments' | 'products'>('ledger');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    shopName: '',
    ownerName: '',
    mobile: '',
    whatsapp: '',
    address: '',
    villageTown: '',
    town: '',
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

  const towns = useMemo(
    () =>
      Array.from(
        new Set(shops.map((s) => (s.town || s.villageTown || '').trim()).filter(Boolean))
      ).sort(),
    [shops]
  );

  const routes = useMemo(
    () => Array.from(new Set(shops.map((s) => (s.route || '').trim()).filter(Boolean))).sort(),
    [shops]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shops
      .filter((s) => {
        if (blockFilter !== 'all' && s.blockArea !== blockFilter) return false;
        if (townFilter !== 'all' && (s.town || s.villageTown) !== townFilter) return false;
        if (routeFilter !== 'all' && (s.route || '') !== routeFilter) return false;
        if (!q) return true;
        return (
          s.shopName.toLowerCase().includes(q) ||
          s.ownerName.toLowerCase().includes(q) ||
          s.mobile.toLowerCase().includes(q) ||
          s.villageTown.toLowerCase().includes(q) ||
          (s.town || '').toLowerCase().includes(q) ||
          s.blockArea.toLowerCase().includes(q) ||
          s.district.toLowerCase().includes(q) ||
          (s.route || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.shopName.localeCompare(b.shopName));
  }, [shops, search, blockFilter, townFilter, routeFilter]);

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
      town: '',
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
      town: s.town || '',
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

  const shopSalesAndBills = useMemo(() => {
    if (!ledgerShop) return [];
    const list: Array<{
      id: string;
      source: 'Dispatch' | 'Bill Book';
      date: string;
      invoiceNo: string;
      netTotal: number;
      paid: number;
      due: number;
      status: string;
    }> = [];
    for (const s of sales) {
      if (s.shopId === ledgerShop.id && s.deliveryStatus !== 'reversed') {
        list.push({
          id: s.id,
          source: 'Dispatch',
          date: s.saleDate,
          invoiceNo: s.invoiceNumber,
          netTotal: s.netTotal,
          paid: s.paymentReceived,
          due: s.remainingDue,
          status: s.deliveryStatus,
        });
      }
    }
    for (const inv of invoices) {
      if (inv.shopId === ledgerShop.id && inv.status === 'confirmed') {
        list.push({
          id: inv.id,
          source: 'Bill Book',
          date: inv.invoiceDate,
          invoiceNo: inv.invoiceNumber,
          netTotal: inv.netTotal,
          paid: inv.paymentReceived,
          due: inv.remainingDue,
          status: inv.paymentStatus,
        });
      }
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [ledgerShop, sales, invoices]);

  const shopPayments = useMemo(() => {
    if (!ledgerShop) return [];
    return payments
      .filter((p) => p.partyType === 'shop' && p.partyId === ledgerShop.id && p.status === 'active')
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [ledgerShop, payments]);

  const shopProductHistory = useMemo(() => {
    if (!ledgerShop) return [];
    const prodTotals = new Map<
      string,
      { productName: string; sku: string; unit: string; qty: number; value: number; lastDate: string }
    >();
    const validSales = new Map(
      sales.filter((s) => s.shopId === ledgerShop.id && s.deliveryStatus !== 'reversed').map((s) => [s.id, s])
    );
    const validBills = new Map(
      invoices.filter((i) => i.shopId === ledgerShop.id && i.status === 'confirmed').map((i) => [i.id, i])
    );
    for (const si of saleItems) {
      const s = validSales.get(si.saleId);
      if (!s) continue;
      const cur = prodTotals.get(si.productId) || {
        productName: si.productName,
        sku: si.sku,
        unit: si.unit,
        qty: 0,
        value: 0,
        lastDate: s.saleDate,
      };
      cur.qty += si.deliveredQty;
      cur.value += si.lineTotal;
      if (s.saleDate > cur.lastDate) cur.lastDate = s.saleDate;
      prodTotals.set(si.productId, cur);
    }
    for (const ii of invoiceItems) {
      const inv = validBills.get(ii.invoiceId);
      if (!inv) continue;
      const cur = prodTotals.get(ii.productId) || {
        productName: ii.productName,
        sku: ii.sku,
        unit: ii.unit,
        qty: 0,
        value: 0,
        lastDate: inv.invoiceDate,
      };
      cur.qty += ii.qty;
      cur.value += ii.amount;
      if (inv.invoiceDate > cur.lastDate) cur.lastDate = inv.invoiceDate;
      prodTotals.set(ii.productId, cur);
    }
    return Array.from(prodTotals.values()).sort((a, b) => b.value - a.value);
  }, [ledgerShop, sales, saleItems, invoices, invoiceItems]);

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
    for (const inv of invoices) {
      if (inv.shopId === ledgerShop.id && inv.status === 'confirmed') {
        items.push({
          date: inv.invoiceDate,
          type: 'Bill Book Invoice',
          ref: inv.invoiceNumber,
          debit: inv.netTotal,
          credit: 0,
        });
      }
    }
    for (const p of shopPayments) {
      items.push({
        date: p.paymentDate,
        type: p.paymentKind === 'credit_note' ? 'Credit Note' : `Payment (${p.method.toUpperCase()})`,
        ref: p.receiptNumber,
        debit: p.paymentKind === 'refund' ? p.amount : 0,
        credit: p.paymentKind === 'refund' ? 0 : p.amount,
      });
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
  }, [ledgerShop, sales, invoices, shopPayments, returns]);

  const openWhatsAppShop = (s: Shop) => {
    const raw = (s.whatsapp || s.mobile || '').replace(/\D/g, '');
    const phone = raw.length === 10 ? `91${raw}` : raw;
    const msg = encodeURIComponent(
      `Namaskar ${s.ownerName} (${s.shopName}), greeting from Pramanik Digital Point, Singda, Dantan (Ph: 95933 53980).`
    );
    window.open(
      phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

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
              placeholder="Search shop, phone, village, block, route..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-cyan-600 focus:outline-none"
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
          <select
            value={townFilter}
            onChange={(e) => setTownFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Towns / Villages</option>
            {towns.map((tw) => (
              <option key={tw} value={tw}>
                {tw}
              </option>
            ))}
          </select>
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Routes</option>
            {routes.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
        </div>

        {caps.canManageShops && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
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
                        {s.villageTown}
                        {s.town && s.town !== s.villageTown ? ` (${s.town})` : ''}, {s.blockArea}
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
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openWhatsAppShop(s)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                          title="Contact via WhatsApp"
                        >
                          <MessageCircle className="h-3 w-3" />
                          <span>WA</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerShop(s);
                            setProfileTab('ledger');
                          }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-cyan-700 hover:bg-cyan-50"
                        >
                          <BookOpen className="h-3 w-3" />
                          <span>Profile & Ledger</span>
                        </button>
                        {caps.canManageShops && (
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="whitespace-nowrap rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-cyan-700 hover:bg-cyan-50"
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
              <label className="mb-1 block font-medium text-slate-700">Village / Market *</label>
              <input
                type="text"
                required
                value={form.villageTown}
                onChange={(e) => setForm({ ...form, villageTown: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Town / Sub-Hub (Optional)</label>
              <input
                type="text"
                value={form.town}
                onChange={(e) => setForm({ ...form, town: e.target.value })}
                placeholder="e.g., Dantan, Belda, Egra"
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
              className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Shop Profile & Full History Modal */}
      <Modal
        open={Boolean(ledgerShop)}
        onClose={() => setLedgerShop(null)}
        title={`Shop Profile — ${ledgerShop?.shopName || ''}`}
        subtitle={`Owner: ${ledgerShop?.ownerName || ''} · ${ledgerShop?.villageTown || ''}, ${ledgerShop?.blockArea || ''} · Closing Outstanding: ${formatINR(ledgerShop?.currentOutstanding || 0)}`}
        size="xl"
      >
        {ledgerShop && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-5">
                <div>
                  <div className="text-[11px] text-slate-500">Total Purchases</div>
                  <div className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR(ledgerShop.totalPurchases)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Total Paid</div>
                  <div className="font-mono font-bold text-emerald-700 tabular-nums">
                    {formatINR(ledgerShop.totalPayments)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Current Outstanding</div>
                  <div className="font-mono font-bold text-amber-700 tabular-nums">
                    {formatINR(ledgerShop.currentOutstanding)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Credit Limit</div>
                  <div className="font-mono font-semibold text-slate-700 tabular-nums">
                    {formatINR(ledgerShop.creditLimit)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openWhatsAppShop(ledgerShop)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    generateShopLedgerPDF(ledgerShop, sales, invoices, payments, returns, settings)
                  }
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-cyan-600 px-3 py-1.5 font-semibold text-white hover:bg-cyan-700"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Download Ledger PDF</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setProfileTab('ledger')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'ledger'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Running Ledger ({ledgerRows.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('bills')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'bills'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sales & Bills ({shopSalesAndBills.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('payments')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'payments'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Payments ({shopPayments.length})
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('products')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  profileTab === 'products'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Products Bought ({shopProductHistory.length})
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
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatINR(ledgerShop.openingBalance)}
                      </td>
                    </tr>
                    {ledgerRows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {formatDateDDMMYYYY(r.date)}
                        </td>
                        <td className="px-3 py-2 text-slate-800">{r.type}</td>
                        <td className="px-3 py-2 font-mono text-slate-600">{r.ref}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-900 tabular-nums">
                          {r.debit > 0 ? formatINR(r.debit) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700 tabular-nums">
                          {r.credit > 0 ? formatINR(r.credit) : '-'}
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

            {profileTab === 'bills' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Bill / Invoice No</th>
                      <th className="px-3 py-2 font-medium">Module</th>
                      <th className="px-3 py-2 text-right font-medium">Net Total</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-right font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shopSalesAndBills.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          No sales or bills recorded for this shop.
                        </td>
                      </tr>
                    ) : (
                      shopSalesAndBills.map((b) => (
                        <tr key={b.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(b.date)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {b.invoiceNo}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {b.source} ({b.status})
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatINR(b.netTotal)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700 tabular-nums">
                            {formatINR(b.paid)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-amber-700 tabular-nums">
                            {formatINR(b.due)}
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
                      <th className="px-3 py-2 font-medium">Receipt No</th>
                      <th className="px-3 py-2 font-medium">Method / Ref</th>
                      <th className="px-3 py-2 font-medium">Linked Bill</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shopPayments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          No payments collected yet.
                        </td>
                      </tr>
                    ) : (
                      shopPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(p.paymentDate)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {p.receiptNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {p.method.toUpperCase()} {p.referenceNo ? `· ${p.referenceNo}` : ''}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-500">
                            {p.linkedInvoiceNo || '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                            {formatINR(p.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'products' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 text-right font-medium">Total Qty Bought</th>
                      <th className="px-3 py-2 text-right font-medium">Total Spend</th>
                      <th className="px-3 py-2 font-medium">Last Purchase</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shopProductHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          No product history found for this shop.
                        </td>
                      </tr>
                    ) : (
                      shopProductHistory.map((item) => (
                        <tr key={item.sku}>
                          <td className="px-3 py-2 font-medium text-slate-900">{item.productName}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{item.sku}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {item.qty} {item.unit}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatINR(item.value)}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(item.lastDate)}
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
