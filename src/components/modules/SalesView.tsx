import React, { useMemo, useState } from 'react';
import { CheckCircle2, MessageCircle, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { completePartialDelivery, createSaleTransaction } from '../../lib/erpService';
import { buildWhatsAppInvoiceLink, generateSaleInvoicePDF } from '../../lib/exportUtils';
import { formatDateDDMMYYYY, formatINR, getTodayIST } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { DeliveryMethod, PaymentMethod, Sale } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const SalesView: React.FC = () => {
  const {
    profile,
    caps,
    lang,
    shops,
    suppliers,
    products,
    stockBatches,
    sales,
    saleItems,
    settings,
  } = useErp();

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | DeliveryMethod>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailSale, setDetailSale] = useState<Sale | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    deliveryMethod: 'warehouse_dispatch' as DeliveryMethod,
    shopId: '',
    supplierId: '',
    supplierInvoiceNo: '',
    supplierAmountPaid: 0,
    supplierPaymentMethod: 'bank_transfer' as PaymentMethod,
    saleDate: getTodayIST(),
    discount: 0,
    transportExpense: 0,
    paymentReceived: 0,
    paymentMethod: 'cash' as PaymentMethod,
    notes: '',
  });

  const [lines, setLines] = useState<
    Array<{
      productId: string;
      orderedQty: number;
      deliveredQty: number;
      sellingPrice: number;
      directUnitCost: number;
    }>
  >([]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales
      .filter((s) => {
        if (methodFilter !== 'all' && s.deliveryMethod !== methodFilter) return false;
        if (!q) return true;
        return (
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.shopName.toLowerCase().includes(q) ||
          (s.supplierName || '').toLowerCase().includes(q) ||
          (s.shopBlock || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [sales, search, methodFilter]);

  const openNewSale = () => {
    setErr(null);
    const activeShop = shops.find((s) => s.status === 'active');
    const activeSup = suppliers.find((s) => s.status === 'active');
    const firstProd = products.find((p) => p.status === 'active');
    setForm({
      deliveryMethod: 'warehouse_dispatch',
      shopId: activeShop?.id || '',
      supplierId: activeSup?.id || '',
      supplierInvoiceNo: '',
      supplierAmountPaid: 0,
      supplierPaymentMethod: 'bank_transfer',
      saleDate: getTodayIST(),
      discount: 0,
      transportExpense: 0,
      paymentReceived: 0,
      paymentMethod: 'cash',
      notes: '',
    });
    setLines(
      firstProd
        ? [
            {
              productId: firstProd.id,
              orderedQty: 5,
              deliveredQty: 5,
              sellingPrice: firstProd.sellingPrice,
              directUnitCost: firstProd.purchasePrice,
            },
          ]
        : []
    );
    setModalOpen(true);
  };

  const handleProductSelect = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    setLines(
      lines.map((l, i) =>
        i === idx
          ? {
              ...l,
              productId,
              sellingPrice: p ? p.sellingPrice : l.sellingPrice,
              directUnitCost: p ? p.purchasePrice : l.directUnitCost,
            }
          : l
      )
    );
  };

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (Number(l.orderedQty) || 0) * (Number(l.sellingPrice) || 0),
        0
      ),
    [lines]
  );
  const netTotal = Math.max(0, subtotal - (form.discount || 0) + (form.transportExpense || 0));
  const directCostTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + (Number(l.orderedQty) || 0) * (Number(l.directUnitCost) || 0),
        0
      ),
    [lines]
  );

  const selectedShop = useMemo(
    () => shops.find((s) => s.id === form.shopId),
    [shops, form.shopId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!form.shopId || lines.length === 0) {
      setErr('Select a shop and add at least one product.');
      return;
    }
    if (form.deliveryMethod === 'direct_supplier_dispatch' && !form.supplierId) {
      setErr('Select a supplier for Direct Supplier Dispatch.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createSaleTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          ...form,
          items: lines,
          invoicePrefix: settings?.invoicePrefix || 'PDP',
          allowNegativeStock: Boolean(settings?.allowNegativeStock),
        },
        stockBatches
      );
      setModalOpen(false);
    } catch (saleErr) {
      setErr(saleErr instanceof Error ? saleErr.message : 'Failed to create dispatch.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteDelivery = async (sale: Sale) => {
    if (!profile) return;
    const items = saleItems.filter((si) => si.saleId === sale.id);
    try {
      await completePartialDelivery(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        sale,
        items,
        Boolean(settings?.allowNegativeStock)
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to complete delivery.');
    }
  };

  const handlePrint = (sale: Sale) => {
    const items = saleItems.filter((si) => si.saleId === sale.id);
    const shop = shops.find((sh) => sh.id === sale.shopId);
    generateSaleInvoicePDF(sale, items, shop, settings);
  };

  const handleWhatsApp = (sale: Sale) => {
    const items = saleItems.filter((si) => si.saleId === sale.id);
    const shop = shops.find((sh) => sh.id === sale.shopId);
    const url = buildWhatsAppInvoiceLink(sale, items, shop);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const detailItems = useMemo(() => {
    if (!detailSale) return [];
    return saleItems.filter((si) => si.saleId === detailSale.id);
  }, [detailSale, saleItems]);

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {err}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice, shop, area, supplier..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs"
            />
          </div>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as typeof methodFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Dispatch Methods</option>
            <option value="warehouse_dispatch">{t(lang, 'warehouse_dispatch')}</option>
            <option value="direct_supplier_dispatch">
              {t(lang, 'direct_supplier_dispatch')}
            </option>
          </select>
        </div>

        {caps.canCreateSales && (
          <button
            type="button"
            onClick={openNewSale}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Sale / Dispatch</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Invoice & Date</th>
              <th className="px-4 py-3 font-medium">Shop & Area</th>
              <th className="px-4 py-3 font-medium">Method & Status</th>
              <th className="px-4 py-3 text-right font-medium">Net Total</th>
              <th className="px-4 py-3 text-right font-medium">Received</th>
              <th className="px-4 py-3 text-right font-medium">Due</th>
              {caps.canViewProfitMetrics && (
                <th className="px-4 py-3 text-right font-medium">Gross Profit</th>
              )}
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
                    <button
                      type="button"
                      onClick={() => setDetailSale(s)}
                      className="font-mono font-semibold text-blue-700 hover:underline"
                    >
                      {s.invoiceNumber}
                    </button>
                    <div className="font-mono text-[11px] text-slate-500">
                      {formatDateDDMMYYYY(s.saleDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{s.shopName}</div>
                    <div className="text-[11px] text-slate-500">
                      {s.shopBlock || '-'} · By {s.createdByName}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-800">
                      {s.deliveryMethod === 'warehouse_dispatch'
                        ? 'Warehouse Dispatch'
                        : `Direct (${s.supplierName || 'Supplier'})`}
                    </div>
                    <div
                      className={`text-[11px] font-semibold ${
                        s.deliveryStatus === 'delivered'
                          ? 'text-emerald-700'
                          : s.deliveryStatus === 'partial'
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {s.deliveryStatus.toUpperCase()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(s.netTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-700 tabular-nums">
                    {formatINR(s.paymentReceived)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700 tabular-nums">
                    {formatINR(s.remainingDue)}
                  </td>
                  {caps.canViewProfitMetrics && (
                    <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                      {formatINR(s.grossProfit)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {(s.deliveryStatus === 'partial' || s.deliveryStatus === 'pending') &&
                        caps.canCreateSales && (
                          <button
                            type="button"
                            onClick={() => handleCompleteDelivery(s)}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                            title="Complete remaining delivery"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Deliver Rest</span>
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => handlePrint(s)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        title="Download PDF Invoice"
                      >
                        <Printer className="h-3 w-3" />
                        <span>PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleWhatsApp(s)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                        title="Share via WhatsApp"
                      >
                        <MessageCircle className="h-3 w-3" />
                        <span>WA</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Sale / Dispatch Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Wholesale Sale & Delivery"
        subtitle="Choose Warehouse Dispatch (deducts central inventory) or Direct Supplier Dispatch (bypasses warehouse inventory)."
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}

          {/* Method Switch */}
          <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setForm({ ...form, deliveryMethod: 'warehouse_dispatch' })}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                form.deliveryMethod === 'warehouse_dispatch'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              A. Warehouse Dispatch (Deducts Warehouse Stock)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, deliveryMethod: 'direct_supplier_dispatch' })}
              className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                form.deliveryMethod === 'direct_supplier_dispatch'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              B. Direct Supplier Dispatch (No Warehouse Deduction)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Receiving Shop *</label>
              <select
                required
                value={form.shopId}
                onChange={(e) => setForm({ ...form, shopId: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select Shop</option>
                {shops
                  .filter((s) => s.status === 'active')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shopName} ({s.villageTown}, {s.blockArea}) — Due: {formatINR(s.currentOutstanding)}
                    </option>
                  ))}
              </select>
              {selectedShop &&
                selectedShop.creditLimit > 0 &&
                selectedShop.currentOutstanding + Math.max(0, netTotal - form.paymentReceived) >
                  selectedShop.creditLimit && (
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">
                    Alert: This invoice will exceed credit limit ({formatINR(selectedShop.creditLimit)}).
                  </p>
                )}
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Dispatch Date *</label>
              <input
                type="date"
                required
                value={form.saleDate}
                onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>

            {form.deliveryMethod === 'direct_supplier_dispatch' && (
              <>
                <div>
                  <label className="mb-1 block font-medium text-slate-700">Source Supplier *</label>
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
                  <label className="mb-1 block font-medium text-slate-700">
                    Supplier Invoice Ref
                  </label>
                  <input
                    type="text"
                    value={form.supplierInvoiceNo}
                    onChange={(e) => setForm({ ...form, supplierInvoiceNo: e.target.value })}
                    placeholder="Optional supplier bill no"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
                  />
                </div>
                {caps.canRecordSupplierPayments && (
                  <div>
                    <label className="mb-1 block font-medium text-slate-700">
                      Paid to Supplier (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.supplierAmountPaid}
                      onChange={(e) =>
                        setForm({ ...form, supplierAmountPaid: Number(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Line Items */}
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-700">
                Invoice Items (Set Delivered &lt; Ordered for Partial Delivery)
              </span>
              <button
                type="button"
                onClick={() => {
                  const p = products.find((x) => x.status === 'active');
                  if (!p) return;
                  setLines([
                    ...lines,
                    {
                      productId: p.id,
                      orderedQty: 1,
                      deliveredQty: 1,
                      sellingPrice: p.sellingPrice,
                      directUnitCost: p.purchasePrice,
                    },
                  ]);
                }}
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Product</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-2 py-2">
                  <div className="col-span-4">
                    <select
                      value={line.productId}
                      onChange={(e) => handleProductSelect(idx, e.target.value)}
                      className="w-full rounded border border-slate-200 px-2 py-1.5"
                    >
                      {products
                        .filter((p) => p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Wh: {p.availableQty} {p.unit})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      value={line.orderedQty}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setLines(
                          lines.map((l, i) =>
                            i === idx ? { ...l, orderedQty: val, deliveredQty: val } : l
                          )
                        );
                      }}
                      title="Ordered Qty"
                      placeholder="Order"
                      className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      max={line.orderedQty}
                      value={line.deliveredQty}
                      onChange={(e) =>
                        setLines(
                          lines.map((l, i) =>
                            i === idx ? { ...l, deliveredQty: Number(e.target.value) } : l
                          )
                        )
                      }
                      title="Delivered Now Qty"
                      placeholder="Deliv"
                      className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                    />
                  </div>
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
                      title="Wholesale Selling Price"
                      placeholder="Sell ₹"
                      className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                    />
                  </div>
                  {form.deliveryMethod === 'direct_supplier_dispatch' ? (
                    <div className="col-span-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.directUnitCost}
                        onChange={(e) =>
                          setLines(
                            lines.map((l, i) =>
                              i === idx ? { ...l, directUnitCost: Number(e.target.value) } : l
                            )
                          )
                        }
                        title="Supplier Purchase Rate"
                        placeholder="Cost"
                        className="w-full rounded border border-slate-200 px-1.5 py-1.5 font-mono"
                      />
                    </div>
                  ) : (
                    <div className="col-span-1 text-right font-mono text-[11px] font-semibold">
                      {formatINR(line.orderedQty * line.sellingPrice)}
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
              <label className="mb-1 block font-medium text-slate-700">Transport Expense (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.transportExpense}
                onChange={(e) => setForm({ ...form, transportExpense: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Shop Payment Received (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.paymentReceived}
                onChange={(e) => setForm({ ...form, paymentReceived: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Mode</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700">Delivery Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Vehicle number, driver name, or delivery remarks"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="font-mono text-xs text-slate-700">
              Net Total: <strong className="text-slate-900">{formatINR(netTotal)}</strong> · Shop
              Due:{' '}
              <strong className="text-amber-700">
                {formatINR(Math.max(0, netTotal - (form.paymentReceived || 0)))}
              </strong>
              {form.deliveryMethod === 'direct_supplier_dispatch' && caps.canViewProfitMetrics && (
                <>
                  {' '}
                  · Est. Profit:{' '}
                  <strong className="text-emerald-700">
                    {formatINR(netTotal - directCostTotal)}
                  </strong>
                </>
              )}
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
                {saving ? 'Generating Invoice...' : 'Create Invoice & Dispatch'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Invoice Item Drilldown Modal */}
      <Modal
        open={Boolean(detailSale)}
        onClose={() => setDetailSale(null)}
        title={`Invoice ${detailSale?.invoiceNumber || ''}`}
        subtitle={`${detailSale?.shopName || ''} · ${formatDateDDMMYYYY(detailSale?.saleDate)}`}
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <table className="w-full text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Ordered</th>
                <th className="px-3 py-2 text-right font-medium">Delivered</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailItems.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 font-medium text-slate-900">{it.productName}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {it.orderedQty} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {it.deliveredQty} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatINR(it.sellingPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {formatINR(it.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {detailSale && (
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => handlePrint(detailSale)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{t(lang, 'print_invoice')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleWhatsApp(detailSale)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>{t(lang, 'share_whatsapp')}</span>
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
