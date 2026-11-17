import React, { useMemo, useState } from 'react';
import { Eye, Plus, Search, Trash2 } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { createPurchaseTransaction, recordPaymentTransaction } from '../../lib/erpService';
import { formatDateDDMMYYYY, formatINR, getTodayIST, makeInvoiceNumber } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { PaymentMethod, Purchase, PurchaseType } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const PurchasesView: React.FC = () => {
  const { profile, caps, lang, suppliers, shops, products, purchases, purchaseItems, settings } = useErp();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PurchaseType>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null);
  const [payDuePurchase, setPayDuePurchase] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    purchaseType: 'warehouse' as PurchaseType,
    supplierId: '',
    targetShopId: '',
    invoiceNumber: '',
    purchaseDate: getTodayIST(),
    discount: 0,
    additionalExpenses: 0,
    amountPaid: 0,
    paymentMethod: 'bank_transfer' as PaymentMethod,
    shopPaymentReceived: 0,
    shopPaymentMethod: 'cash' as PaymentMethod,
    notes: '',
  });

  const [lines, setLines] = useState<
    Array<{ productId: string; qty: number; unitRate: number; sellingPrice: number }>
  >([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchases
      .filter((p) => {
        if (typeFilter !== 'all' && p.purchaseType !== typeFilter) return false;
        if (!q) return true;
        return (
          p.invoiceNumber.toLowerCase().includes(q) ||
          p.supplierName.toLowerCase().includes(q) ||
          (p.targetShopName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [purchases, search, typeFilter]);

  const openCreate = () => {
    setErr(null);
    const activeSup = suppliers.find((s) => s.status === 'active');
    const activeShop = shops.find((s) => s.status === 'active');
    const firstProd = products.find((p) => p.status === 'active');
    setForm({
      purchaseType: 'warehouse',
      supplierId: activeSup?.id || '',
      targetShopId: activeShop?.id || '',
      invoiceNumber: makeInvoiceNumber('SUP'),
      purchaseDate: getTodayIST(),
      discount: 0,
      additionalExpenses: 0,
      amountPaid: 0,
      paymentMethod: 'bank_transfer',
      shopPaymentReceived: 0,
      shopPaymentMethod: 'cash',
      notes: '',
    });
    setLines(
      firstProd
        ? [
            {
              productId: firstProd.id,
              qty: 10,
              unitRate: firstProd.purchasePrice,
              sellingPrice: firstProd.sellingPrice,
            },
          ]
        : []
    );
    setModalOpen(true);
  };

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unitRate) || 0), 0),
    [lines]
  );
  const totalCost = Math.max(0, subtotal - (form.discount || 0) + (form.additionalExpenses || 0));
  const shopSaleTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.sellingPrice) || 0), 0),
    [lines]
  );

  const handleAddLine = () => {
    const firstProd = products.find((p) => p.status === 'active');
    if (!firstProd) return;
    setLines([
      ...lines,
      {
        productId: firstProd.id,
        qty: 1,
        unitRate: firstProd.purchasePrice,
        sellingPrice: firstProd.sellingPrice,
      },
    ]);
  };

  const handleProductChange = (idx: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    setLines(
      lines.map((l, i) =>
        i === idx
          ? {
              ...l,
              productId,
              unitRate: prod ? prod.purchasePrice : l.unitRate,
              sellingPrice: prod ? prod.sellingPrice : l.sellingPrice,
            }
          : l
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!form.supplierId || lines.length === 0) {
      setErr('Select a supplier and at least one product.');
      return;
    }
    if (form.purchaseType === 'direct_to_shop' && !form.targetShopId) {
      setErr('Select the receiving shop for direct-to-shop purchase.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createPurchaseTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          ...form,
          items: lines,
          invoicePrefix: settings?.invoicePrefix || 'PDP',
        }
      );
      setModalOpen(false);
    } catch (saveErr) {
      setErr(saveErr instanceof Error ? saveErr.message : 'Failed to save purchase.');
    } finally {
      setSaving(false);
    }
  };

  const handleSettleSupplierDue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !payDuePurchase) return;
    setSaving(true);
    try {
      await recordPaymentTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          partyType: 'supplier',
          partyId: payDuePurchase.supplierId,
          paymentDate: getTodayIST(),
          amount: payAmount,
          method: payMethod,
          paymentKind: payAmount >= payDuePurchase.remainingDue ? 'full' : 'partial',
          referenceNo: payRef,
          linkedInvoiceId: payDuePurchase.id,
          notes: `Settlement for purchase ${payDuePurchase.invoiceNumber}`,
        }
      );
      setPayDuePurchase(null);
    } finally {
      setSaving(false);
    }
  };

  const detailItems = useMemo(() => {
    if (!detailPurchase) return [];
    return purchaseItems.filter((pi) => pi.purchaseId === detailPurchase.id);
  }, [detailPurchase, purchaseItems]);

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
              placeholder="Search invoice, supplier, shop..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Purchase Types</option>
            <option value="warehouse">{t(lang, 'warehouse_purchase')}</option>
            <option value="direct_to_shop">{t(lang, 'direct_to_shop_purchase')}</option>
          </select>
        </div>

        {caps.canManagePurchases && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Purchase</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Invoice & Date</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Workflow Type</th>
              <th className="px-4 py-3 text-right font-medium">Total Cost</th>
              <th className="px-4 py-3 text-right font-medium">Paid</th>
              <th className="px-4 py-3 text-right font-medium">Supplier Due</th>
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
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-900">{p.invoiceNumber}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {formatDateDDMMYYYY(p.purchaseDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.supplierName}</div>
                    <div className="text-[11px] text-slate-400">By {p.createdByName}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.purchaseType === 'warehouse' ? (
                      <span className="font-medium text-blue-700">Warehouse Stock-In</span>
                    ) : (
                      <div>
                        <span className="font-medium text-amber-700">Direct-to-Shop</span>
                        <div className="text-[11px] text-slate-500">{p.targetShopName}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(p.totalCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                    {formatINR(p.amountPaid)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-red-700 tabular-nums">
                    {formatINR(p.remainingDue)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-medium ${
                        p.status === 'completed'
                          ? 'text-emerald-700'
                          : p.status === 'partial'
                          ? 'text-amber-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailPurchase(p)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Items</span>
                      </button>
                      {p.remainingDue > 0.01 && caps.canRecordSupplierPayments && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayDuePurchase(p);
                            setPayAmount(p.remainingDue);
                            setPayRef('');
                          }}
                          className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                        >
                          Pay Due
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

      {/* Create Purchase Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record New Purchase"
        subtitle="Warehouse purchases increase central stock; Direct-to-Shop purchases dispatch straight to the shop without entering warehouse inventory."
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}

          {/* Purchase Type Switch */}
          <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setForm({ ...form, purchaseType: 'warehouse' })}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                form.purchaseType === 'warehouse'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A. Warehouse Purchase (Adds to Stock)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, purchaseType: 'direct_to_shop' })}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                form.purchaseType === 'direct_to_shop'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              B. Direct-to-Shop Purchase (Bypass Warehouse)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Supplier *</label>
              <select
                required
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select Supplier</option>
                {suppliers
                  .filter((s) => s.status === 'active')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Supplier Invoice No *</label>
              <input
                type="text"
                required
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Purchase Date *</label>
              <input
                type="date"
                required
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>

            {form.purchaseType === 'direct_to_shop' && (
              <div className="sm:col-span-3">
                <label className="mb-1 block font-medium text-slate-700">
                  Receiving Retail Shop * (Creates linked Sale & Receivable)
                </label>
                <select
                  required
                  value={form.targetShopId}
                  onChange={(e) => setForm({ ...form, targetShopId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select Shop</option>
                  {shops
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shopName} ({s.blockArea})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-700">Purchase Items</span>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Line</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-2 py-2">
                  <div className="col-span-5">
                    <select
                      value={line.productId}
                      onChange={(e) => handleProductChange(idx, e.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1.5"
                    >
                      {products
                        .filter((p) => p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      value={line.qty}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, i) => (i === idx ? { ...l, qty: Number(e.target.value) } : l))
                        )
                      }
                      placeholder="Qty"
                      className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitRate}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, i) =>
                            i === idx ? { ...l, unitRate: Number(e.target.value) } : l
                          )
                        )
                      }
                      placeholder="Buy Rate"
                      className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                    />
                  </div>
                  {form.purchaseType === 'direct_to_shop' ? (
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.sellingPrice}
                        onChange={(e) =>
                          setLines(
                            lines.map((l, i) =>
                              i === idx ? { ...l, sellingPrice: Number(e.target.value) } : l
                            )
                          )
                        }
                        placeholder="Sell Rate"
                        className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                      />
                    </div>
                  ) : (
                    <div className="col-span-2 text-right font-mono font-medium text-slate-700">
                      {formatINR(line.qty * line.unitRate)}
                    </div>
                  )}
                  <div className="col-span-1 text-right">
                    <button
                      type="button"
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financials */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Discount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Freight / Expenses (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.additionalExpenses}
                onChange={(e) => setForm({ ...form, additionalExpenses: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Paid to Supplier (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amountPaid}
                onChange={(e) => setForm({ ...form, amountPaid: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Supplier Payment Mode</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {form.purchaseType === 'direct_to_shop' && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              <div>
                <div className="text-[11px] text-slate-500">Linked Shop Sale Value</div>
                <div className="font-mono text-sm font-semibold text-slate-900">
                  {formatINR(shopSaleTotal)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Estimated Gross Profit</div>
                <div className="font-mono text-sm font-semibold text-emerald-700">
                  {formatINR(shopSaleTotal - totalCost)}
                </div>
              </div>
              <div>
                <label className="mb-1 block font-medium text-slate-700">
                  Shop Payment Received (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shopPaymentReceived}
                  onChange={(e) =>
                    setForm({ ...form, shopPaymentReceived: Number(e.target.value) })
                  }
                  className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="font-mono text-xs text-slate-700">
              Total Purchase Cost: <strong className="text-slate-900">{formatINR(totalCost)}</strong>{' '}
              · Supplier Due:{' '}
              <strong className="text-red-700">
                {formatINR(Math.max(0, totalCost - (form.amountPaid || 0)))}
              </strong>
            </div>
            <div className="flex gap-2">
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
                {saving ? 'Recording...' : 'Confirm Purchase'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Purchase Items Detail Modal */}
      <Modal
        open={Boolean(detailPurchase)}
        onClose={() => setDetailPurchase(null)}
        title={`Purchase Details — ${detailPurchase?.invoiceNumber || ''}`}
        subtitle={`${detailPurchase?.supplierName || ''} · ${formatDateDDMMYYYY(detailPurchase?.purchaseDate)}`}
      >
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit Rate</th>
              <th className="px-3 py-2 text-right font-medium">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detailItems.map((it) => (
              <tr key={it.id}>
                <td className="px-3 py-2 font-medium text-slate-900">
                  {it.productName} <span className="font-mono text-[11px] text-slate-400">({it.sku})</span>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {it.qty} {it.unit}
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatINR(it.unitRate)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {formatINR(it.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>

      {/* Settle Supplier Due Modal */}
      <Modal
        open={Boolean(payDuePurchase)}
        onClose={() => setPayDuePurchase(null)}
        title={`Pay Supplier Due — ${payDuePurchase?.invoiceNumber || ''}`}
        size="md"
      >
        <form onSubmit={handleSettleSupplierDue} className="space-y-4 text-xs">
          <div>
            <label className="mb-1 block font-medium text-slate-700">Amount Paid (₹)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">UTR / Reference</label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPayDuePurchase(null)}
              className="rounded-lg border border-slate-200 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
            >
              {saving ? 'Processing...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
