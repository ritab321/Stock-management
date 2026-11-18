import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { createReturnTransaction } from '../../lib/erpService';
import { formatDateDDMMYYYY, formatINR, getTodayIST } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { ReturnType } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const ReturnsView: React.FC = () => {
  const { profile, caps, lang, returns, products, shops, suppliers, settings } = useErp();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ReturnType>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    returnType: 'shop_return' as ReturnType,
    returnDate: getTodayIST(),
    partyId: '',
    productId: '',
    qty: 1,
    unitValue: 0,
    condition: 'good_sellable' as 'good_sellable' | 'damaged',
    reason: '',
    linkedInvoiceNo: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return returns
      .filter((r) => {
        if (typeFilter !== 'all' && r.returnType !== typeFilter) return false;
        if (!q) return true;
        return (
          r.returnNumber.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          (r.partyName || '').toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.returnDate.localeCompare(a.returnDate));
  }, [returns, search, typeFilter]);

  const openModal = () => {
    setErr(null);
    const prod = products[0];
    const shop = shops[0];
    const defaultType: ReturnType = caps.canViewCustomerLedgers
      ? 'shop_return'
      : 'damaged_writeoff';
    setForm({
      returnType: defaultType,
      returnDate: getTodayIST(),
      partyId: defaultType === 'shop_return' ? shop?.id || '' : '',
      productId: prod?.id || '',
      qty: 1,
      unitValue:
        defaultType === 'damaged_writeoff'
          ? prod?.purchasePrice || 0
          : prod?.sellingPrice || 0,
      condition: defaultType === 'damaged_writeoff' ? 'damaged' : 'good_sellable',
      reason: '',
      linkedInvoiceNo: '',
    });
    setModalOpen(true);
  };

  const handleProductChange = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    const val =
      form.returnType === 'supplier_return' || form.returnType === 'damaged_writeoff'
        ? prod?.purchasePrice || 0
        : prod?.sellingPrice || 0;
    setForm({ ...form, productId, unitValue: val });
  };

  const handleTypeChange = (returnType: ReturnType) => {
    const prod = products.find((p) => p.id === form.productId);
    const val =
      returnType === 'supplier_return' || returnType === 'damaged_writeoff'
        ? prod?.purchasePrice || 0
        : prod?.sellingPrice || 0;
    const partyId =
      returnType === 'supplier_return'
        ? suppliers[0]?.id || ''
        : returnType === 'shop_return' || returnType === 'replacement'
        ? shops[0]?.id || ''
        : '';
    setForm({
      ...form,
      returnType,
      partyId,
      unitValue: val,
      condition: returnType === 'damaged_writeoff' ? 'damaged' : 'good_sellable',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form.productId) return;
    setSaving(true);
    setErr(null);
    try {
      await createReturnTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          ...form,
          partyId: form.partyId || undefined,
          allowNegativeStock: Boolean(settings?.allowNegativeStock),
        }
      );
      setModalOpen(false);
    } catch (retErr) {
      setErr(retErr instanceof Error ? retErr.message : 'Return processing failed.');
    } finally {
      setSaving(false);
    }
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
              placeholder="Search return no, product, shop, reason..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
          >
            <option value="all">All Return Types</option>
            <option value="shop_return">Shop Returns</option>
            <option value="supplier_return">Supplier Returns</option>
            <option value="damaged_writeoff">Damaged Stock</option>
            <option value="replacement">Replacements</option>
          </select>
        </div>

        {caps.canManageReturns && (
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log Return / Damage</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Return No & Date</th>
              <th className="px-4 py-3 font-medium">Type & Party</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Total Value</th>
              <th className="px-4 py-3 font-medium">Stock Routing</th>
              <th className="px-4 py-3 font-medium">Reason & User</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {t(lang, 'no_records')}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-900">{r.returnNumber}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {formatDateDDMMYYYY(r.returnDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {r.returnType.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="text-[11px] text-slate-500">{r.partyName || 'Internal'}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.productName}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                    {r.qty}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(r.totalValue)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        r.condition === 'good_sellable' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {r.returnedToStock
                        ? 'Returned to Sellable Stock'
                        : r.condition === 'damaged'
                        ? 'Damaged Stock Category'
                        : 'Deducted'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{r.reason}</div>
                    <div className="text-[11px] text-slate-400">
                      By {r.createdByName}
                      {r.linkedInvoiceNo ? ` · Inv ${r.linkedInvoiceNo}` : ''}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Return Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Product Return / Damaged Goods"
        subtitle="Good-quality shop returns return to sellable stock; damaged units route into separate damaged stock."
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Return Type *</label>
              <select
                value={form.returnType}
                onChange={(e) => handleTypeChange(e.target.value as ReturnType)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {caps.canViewCustomerLedgers && (
                  <option value="shop_return">Shop Return (Customer Credit)</option>
                )}
                {caps.canViewSupplierFinancials && (
                  <option value="supplier_return">Supplier Return (Debit Supplier)</option>
                )}
                <option value="damaged_writeoff">Damaged Goods (Warehouse Write-off)</option>
                {caps.canViewCustomerLedgers && (
                  <option value="replacement">Customer Replacement</option>
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={form.returnDate}
                onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>

            {form.returnType !== 'damaged_writeoff' && (
              <div className="sm:col-span-2">
                <label className="mb-1 block font-medium text-slate-700">
                  {form.returnType === 'supplier_return' ? 'Supplier *' : 'Shop / Customer *'}
                </label>
                <select
                  required
                  value={form.partyId}
                  onChange={(e) => setForm({ ...form, partyId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select Account</option>
                  {form.returnType === 'supplier_return'
                    ? suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))
                    : shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shopName}
                        </option>
                      ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Product *</label>
              <select
                required
                value={form.productId}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — Sellable: {p.availableQty} · Damaged: {p.damagedQty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Quantity *</label>
              <input
                type="number"
                min="1"
                required
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Unit Value (₹) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.unitValue}
                onChange={(e) => setForm({ ...form, unitValue: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Inspection Condition *</label>
              <select
                value={form.condition}
                onChange={(e) =>
                  setForm({ ...form, condition: e.target.value as 'good_sellable' | 'damaged' })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="good_sellable">Good / Sellable (Restore to Stock)</option>
                <option value="damaged">Damaged (Quarantine Damaged Stock)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Linked Invoice No (Optional)
              </label>
              <input
                type="text"
                value={form.linkedInvoiceNo}
                onChange={(e) => setForm({ ...form, linkedInvoiceNo: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Reason *</label>
              <input
                type="text"
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Reason for return, defect, or replacement"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
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
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              {saving ? 'Processing...' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
