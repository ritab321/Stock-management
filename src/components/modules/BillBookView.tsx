import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  FileDown,
  MessageCircle,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import {
  cancelBillInvoiceTransaction,
  createBillInvoiceTransaction,
  recordBillPaymentTransaction,
  updateAndConfirmDraftBillTransaction,
  type BillLineInput,
} from '../../lib/erpService';
import { buildWhatsAppBillLink, generateBillInvoicePDF } from '../../lib/exportUtils';
import {
  formatDateDDMMYYYY,
  formatINR,
  getTodayIST,
  numberToIndianWords,
  roundMoney,
} from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { BillInvoice, PaymentMethod, PrintFormat } from '../../types/erp';
import { Modal } from '../ui/Modal';

type BillFilterTab = 'all' | 'today' | 'monthly' | 'paid' | 'unpaid' | 'partial' | 'draft' | 'cancelled';

export const BillBookView: React.FC = () => {
  const { profile, caps, lang, shops, products, invoices, invoiceItems, settings } = useErp();

  const [filterTab, setFilterTab] = useState<BillFilterTab>('all');
  const [search, setSearch] = useState('');

  // Create / Edit Draft Bill Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<BillInvoice | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(getTodayIST());
  const [shopId, setShopId] = useState('');
  const [lines, setLines] = useState<BillLineInput[]>([]);
  const [discount, setDiscount] = useState(0);
  const [transportCharge, setTransportCharge] = useState(0);
  const [paymentReceived, setPaymentReceived] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Print Preview Modal
  const [previewInv, setPreviewInv] = useState<BillInvoice | null>(null);
  const [printFormat, setPrintFormat] = useState<PrintFormat>(settings?.defaultPrintFormat || 'a4');

  // Collect Payment Modal
  const [payInv, setPayInv] = useState<BillInvoice | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [payDate, setPayDate] = useState(getTodayIST());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Cancel Bill Modal
  const [cancelInv, setCancelInv] = useState<BillInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const activeShops = useMemo(() => shops.filter((s) => s.status === 'active'), [shops]);
  const activeProducts = useMemo(() => products.filter((p) => p.status === 'active'), [products]);

  const itemsByInvoice = useMemo(() => {
    const map = new Map<string, typeof invoiceItems>();
    for (const it of invoiceItems) {
      const list = map.get(it.invoiceId) || [];
      list.push(it);
      map.set(it.invoiceId, list);
    }
    return map;
  }, [invoiceItems]);

  const today = getTodayIST();
  const monthPrefix = today.slice(0, 7);

  const counts = useMemo(() => {
    return {
      all: invoices.length,
      today: invoices.filter((i) => i.invoiceDate === today).length,
      monthly: invoices.filter((i) => i.invoiceDate.startsWith(monthPrefix)).length,
      paid: invoices.filter((i) => i.status === 'confirmed' && i.paymentStatus === 'paid').length,
      unpaid: invoices.filter((i) => i.status === 'confirmed' && i.paymentStatus === 'unpaid').length,
      partial: invoices.filter((i) => i.status === 'confirmed' && i.paymentStatus === 'partial').length,
      draft: invoices.filter((i) => i.status === 'draft').length,
      cancelled: invoices.filter((i) => i.status === 'cancelled').length,
    };
  }, [invoices, today, monthPrefix]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices
      .filter((inv) => {
        if (filterTab === 'today' && inv.invoiceDate !== today) return false;
        if (filterTab === 'monthly' && !inv.invoiceDate.startsWith(monthPrefix)) return false;
        if (filterTab === 'paid' && !(inv.status === 'confirmed' && inv.paymentStatus === 'paid')) return false;
        if (filterTab === 'unpaid' && !(inv.status === 'confirmed' && inv.paymentStatus === 'unpaid')) return false;
        if (filterTab === 'partial' && !(inv.status === 'confirmed' && inv.paymentStatus === 'partial')) return false;
        if (filterTab === 'draft' && inv.status !== 'draft') return false;
        if (filterTab === 'cancelled' && inv.status !== 'cancelled') return false;
        if (!q) return true;
        return (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.shopName.toLowerCase().includes(q) ||
          (inv.shopPhone || '').toLowerCase().includes(q) ||
          (inv.notes || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNumber.localeCompare(a.invoiceNumber));
  }, [invoices, filterTab, search, today, monthPrefix]);

  const openNewBill = () => {
    setEditingDraft(null);
    setErr(null);
    setInvoiceDate(getTodayIST());
    setShopId(activeShops[0]?.id || '');
    const firstProd = activeProducts[0];
    setLines(
      firstProd
        ? [
            {
              productId: firstProd.id,
              description: firstProd.description || '',
              qty: 1,
              rate: firstProd.sellingPrice,
              discount: 0,
            },
          ]
        : []
    );
    setDiscount(0);
    setTransportCharge(0);
    setPaymentReceived(0);
    setPaymentMethod('cash');
    setNotes('');
    setEditorOpen(true);
  };

  const openEditDraft = (inv: BillInvoice) => {
    const its = itemsByInvoice.get(inv.id) || [];
    setEditingDraft(inv);
    setErr(null);
    setInvoiceDate(inv.invoiceDate);
    setShopId(inv.shopId);
    setLines(
      its.map((it) => ({
        productId: it.productId,
        description: it.description || '',
        qty: it.qty,
        rate: it.rate,
        discount: it.discount,
      }))
    );
    setDiscount(inv.discount);
    setTransportCharge(inv.transportCharge);
    setPaymentReceived(inv.paymentReceived);
    setPaymentMethod(inv.paymentMethod);
    setNotes(inv.notes || '');
    setEditorOpen(true);
  };

  const handleDuplicate = (inv: BillInvoice) => {
    const its = itemsByInvoice.get(inv.id) || [];
    setEditingDraft(null);
    setErr(null);
    setInvoiceDate(getTodayIST());
    setShopId(inv.shopId);
    setLines(
      its.map((it) => ({
        productId: it.productId,
        description: it.description || '',
        qty: it.qty,
        rate: it.rate,
        discount: it.discount,
      }))
    );
    setDiscount(inv.discount);
    setTransportCharge(inv.transportCharge);
    setPaymentReceived(0);
    setPaymentMethod(inv.paymentMethod);
    setNotes(`Duplicated from ${inv.invoiceNumber}`);
    setEditorOpen(true);
  };

  const selectedShop = useMemo(() => shops.find((s) => s.id === shopId) || null, [shops, shopId]);

  const totals = useMemo(() => {
    const subtotal = roundMoney(
      lines.reduce((s, l) => s + Math.max(0, roundMoney(l.qty * l.rate - l.discount)), 0)
    );
    const netTotal = Math.max(0, roundMoney(subtotal - discount + transportCharge));
    const due = roundMoney(netTotal - paymentReceived);
    return { subtotal, netTotal, due };
  }, [lines, discount, transportCharge, paymentReceived]);

  const handleSaveBill = async (targetStatus: 'draft' | 'confirmed') => {
    if (!profile) return;
    if (!shopId || lines.length === 0) {
      setErr('Please select a shop and add at least one product line.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (editingDraft) {
        const oldIds = (itemsByInvoice.get(editingDraft.id) || []).map((it) => it.id);
        await updateAndConfirmDraftBillTransaction(
          { uid: profile.uid, displayName: profile.displayName, role: profile.role },
          editingDraft,
          oldIds,
          {
            invoiceDate,
            shopId,
            items: lines,
            discount,
            transportCharge,
            paymentReceived,
            paymentMethod,
            notes,
            targetStatus,
            allowNegativeStock: Boolean(settings?.allowNegativeStock),
          }
        );
      } else {
        await createBillInvoiceTransaction(
          { uid: profile.uid, displayName: profile.displayName, role: profile.role },
          {
            invoiceDate,
            shopId,
            items: lines,
            discount,
            transportCharge,
            paymentReceived,
            paymentMethod,
            notes,
            status: targetStatus,
            invoicePrefix: settings?.invoicePrefix || 'PDP',
            allowNegativeStock: Boolean(settings?.allowNegativeStock),
          }
        );
      }
      setEditorOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save bill.');
    } finally {
      setSaving(false);
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !payInv) return;
    setSaving(true);
    setErr(null);
    try {
      await recordBillPaymentTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        payInv.id,
        payAmt,
        payDate,
        payMethod,
        payRef,
        payNotes
      );
      setPayInv(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to record bill payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !cancelInv) return;
    if (!cancelReason.trim()) {
      setErr('Cancellation reason is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await cancelBillInvoiceTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        cancelInv,
        itemsByInvoice.get(cancelInv.id) || [],
        cancelReason
      );
      setCancelInv(null);
      setCancelReason('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to cancel invoice.');
    } finally {
      setSaving(false);
    }
  };

  const previewItems = useMemo(
    () => (previewInv ? itemsByInvoice.get(previewInv.id) || [] : []),
    [previewInv, itemsByInvoice]
  );
  const previewShop = useMemo(
    () => (previewInv ? shops.find((s) => s.id === previewInv.shopId) || null : null),
    [previewInv, shops]
  );

  return (
    <div className="space-y-4">
      {/* Header & Filter Strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bill no, shop name, phone..."
              className="w-72 rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-violet-600 focus:outline-none"
            />
          </div>

          {caps.canCreateSales && (
            <button
              type="button"
              onClick={openNewBill}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#6D28D9] px-4 py-2 text-xs font-semibold text-white hover:bg-violet-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t(lang, 'bill_create')}</span>
            </button>
          )}
        </div>

        {/* 8 Filter Views */}
        <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ['all', `${t(lang, 'bill_all')} (${counts.all})`],
              ['today', `${t(lang, 'bill_today')} (${counts.today})`],
              ['monthly', `${t(lang, 'bill_monthly')} (${counts.monthly})`],
              ['paid', `${t(lang, 'bill_paid')} (${counts.paid})`],
              ['unpaid', `${t(lang, 'bill_unpaid')} (${counts.unpaid})`],
              ['partial', `${t(lang, 'bill_partial')} (${counts.partial})`],
              ['draft', `${t(lang, 'bill_draft')} (${counts.draft})`],
              ['cancelled', `${t(lang, 'bill_cancelled')} (${counts.cancelled})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilterTab(id)}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filterTab === id
                  ? 'bg-[#6D28D9] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Bill No & Date</th>
              <th className="px-4 py-3 font-medium">Customer / Shop</th>
              <th className="px-4 py-3 font-medium">Bill Status</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 text-right font-medium">Net Total</th>
              <th className="px-4 py-3 text-right font-medium">Paid</th>
              <th className="px-4 py-3 text-right font-medium">Due</th>
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
              filtered.map((inv) => {
                const its = itemsByInvoice.get(inv.id) || [];
                const shop = shops.find((s) => s.id === inv.shopId) || null;
                return (
                  <tr key={inv.id} className={inv.status === 'cancelled' ? 'bg-red-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-[#172554]">{inv.invoiceNumber}</div>
                      <div className="font-mono text-[11px] text-slate-500">
                        {formatDateDDMMYYYY(inv.invoiceDate)} · {inv.itemCount} items
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{inv.shopName}</div>
                      <div className="text-[11px] text-slate-500">
                        {inv.shopPhone || '-'} · {inv.shopBlock || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <span
                        className={
                          inv.status === 'confirmed'
                            ? 'text-[#16A34A]'
                            : inv.status === 'draft'
                            ? 'text-[#2563EB]'
                            : 'text-[#DC2626]'
                        }
                      >
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <span
                        className={
                          inv.paymentStatus === 'paid'
                            ? 'text-[#16A34A]'
                            : inv.paymentStatus === 'partial'
                            ? 'text-[#EA580C]'
                            : 'text-[#DC2626]'
                        }
                      >
                        {inv.paymentStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatINR(inv.netTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#16A34A] tabular-nums">
                      {formatINR(inv.paymentReceived)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#EA580C] tabular-nums">
                      {formatINR(inv.remainingDue)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {inv.status === 'draft' && caps.canCreateSales && (
                          <button
                            type="button"
                            onClick={() => openEditDraft(inv)}
                            className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>Edit / Confirm</span>
                          </button>
                        )}
                        {inv.status === 'confirmed' && inv.remainingDue > 0.01 && caps.canRecordShopPayments && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayInv(inv);
                              setPayAmt(inv.remainingDue);
                              setPayDate(getTodayIST());
                              setPayMethod('cash');
                              setPayRef('');
                              setPayNotes('');
                              setErr(null);
                            }}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-[#16A34A] hover:bg-emerald-100"
                          >
                            <CreditCard className="h-3 w-3" />
                            <span>Pay</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewInv(inv);
                            setPrintFormat(settings?.defaultPrintFormat || 'a4');
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Printer className="h-3 w-3" />
                          <span>Print / View</span>
                        </button>
                        {caps.canCreateSales && (
                          <button
                            type="button"
                            onClick={() => handleDuplicate(inv)}
                            title="Duplicate Bill"
                            className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <a
                          href={buildWhatsAppBillLink(inv, its, shop)}
                          target="_blank"
                          rel="noreferrer"
                          title="Share on WhatsApp"
                          className="rounded border border-emerald-200 p-1 text-[#16A34A] hover:bg-emerald-50"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                        {inv.status !== 'cancelled' && caps.canReverseFinancials && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelInv(inv);
                              setCancelReason('');
                              setErr(null);
                            }}
                            title="Cancel Invoice & Restore Stock"
                            className="rounded border border-red-200 p-1 text-[#DC2626] hover:bg-red-50"
                          >
                            <Ban className="h-3.5 w-3.5" />
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

      {/* Create / Edit Draft Bill Modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingDraft ? `Edit Draft Bill — ${editingDraft.invoiceNumber}` : 'Create Digital Wholesale Bill'}
        subtitle="Add multi-product lines, apply discounts, view customer's previous outstanding, and save as draft or confirm."
        size="xl"
      >
        <div className="space-y-4 text-xs">
          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[#DC2626]">{err}</div>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block font-semibold text-slate-700">Customer / Retail Shop *</label>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              >
                <option value="">Select shop...</option>
                {activeShops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shopName} ({s.villageTown}, {s.blockArea})
                  </option>
                ))}
              </select>
              {selectedShop && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Mobile: <span className="font-mono">{selectedShop.mobile}</span> · Previous Outstanding:{' '}
                  <span className="font-mono font-bold text-[#EA580C]">
                    {formatINR(selectedShop.currentOutstanding)}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-700">Bill Date *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
          </div>

          {/* Product Rows */}
          <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="font-semibold text-[#172554]">Bill Items</span>
              <button
                type="button"
                onClick={() => {
                  const p = activeProducts[0];
                  if (!p) return;
                  setLines([
                    ...lines,
                    { productId: p.id, description: p.description || '', qty: 1, rate: p.sellingPrice, discount: 0 },
                  ]);
                }}
                className="inline-flex items-center gap-1 rounded bg-[#6D28D9] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-800"
              >
                <Plus className="h-3 w-3" /> Add Item
              </button>
            </div>
            <div className="divide-y divide-slate-100 p-2">
              {lines.map((line, idx) => {
                const prod = products.find((p) => p.id === line.productId);
                const lineAmount = Math.max(0, roundMoney(line.qty * line.rate - line.discount));
                return (
                  <div key={idx} className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-[11px] text-slate-500">Product (Stock)</label>
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const np = products.find((p) => p.id === e.target.value);
                          const copy = [...lines];
                          copy[idx] = {
                            ...copy[idx],
                            productId: e.target.value,
                            description: np?.description || '',
                            rate: np?.sellingPrice || 0,
                          };
                          setLines(copy);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1.5"
                      >
                        {activeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.availableQty} {p.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] text-slate-500">Description</label>
                      <input
                        type="text"
                        value={line.description || ''}
                        onChange={(e) => {
                          const copy = [...lines];
                          copy[idx].description = e.target.value;
                          setLines(copy);
                        }}
                        placeholder="Specs/notes"
                        className="w-full rounded border border-slate-200 px-2 py-1.5"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="mb-1 block text-[11px] text-slate-500">
                        Qty {prod ? `(${prod.unit})` : ''}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={line.qty}
                        onChange={(e) => {
                          const copy = [...lines];
                          copy[idx].qty = Math.max(1, Number(e.target.value));
                          setLines(copy);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] text-slate-500">Rate (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.rate}
                        onChange={(e) => {
                          const copy = [...lines];
                          copy[idx].rate = Number(e.target.value);
                          setLines(copy);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="mb-1 block text-[11px] text-slate-500">Disc</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.discount}
                        onChange={(e) => {
                          const copy = [...lines];
                          copy[idx].discount = Number(e.target.value);
                          setLines(copy);
                        }}
                        className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:col-span-2">
                      <div className="font-mono font-bold text-[#172554] tabular-nums">
                        {formatINR(lineAmount)}
                      </div>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals & Payment */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Bill Discount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Transport / Loading (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={transportCharge}
                onChange={(e) => setTransportCharge(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Received (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentReceived}
                onChange={(e) => setPaymentReceived(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Mode</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI / QR</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="rounded-lg bg-violet-50 px-3 py-2 text-right">
              <div className="text-[11px] text-violet-700">Net Bill Total</div>
              <div className="font-mono text-base font-bold text-[#172554] tabular-nums">
                {formatINR(totals.netTotal)}
              </div>
              <div className="font-mono text-[10px] text-[#EA580C]">
                Bill Due: {formatINR(totals.due)}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700">Bill Remarks / Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Transport vehicle, credit terms, or delivery instructions..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveBill('draft')}
              className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveBill('confirmed')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6D28D9] px-5 py-2 font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{saving ? 'Processing...' : 'Confirm & Issue Bill'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Clean White Printable Invoice Preview Modal (A4 / A5 / 80mm / 58mm) */}
      <Modal
        open={Boolean(previewInv)}
        onClose={() => setPreviewInv(null)}
        title={`Invoice Print Preview — ${previewInv?.invoiceNumber || ''}`}
        subtitle="Clean white print format — reprinting never modifies warehouse stock or balances."
        size="xl"
      >
        {previewInv && (
          <div className="space-y-4">
            {/* Format Switcher & Actions (no-print) */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-1 rounded-md bg-white p-1 border border-slate-200">
                {(
                  [
                    ['a4', 'A4 Formal'],
                    ['a5', 'A5 Half'],
                    ['80mm', '80mm Thermal'],
                    ['58mm', '58mm Thermal'],
                  ] as const
                ).map(([fmt, label]) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setPrintFormat(fmt)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${
                      printFormat === fmt ? 'bg-[#172554] text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    generateBillInvoicePDF(previewInv, previewItems, printFormat, previewShop, settings)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#6D28D9] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-800"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  <span>Download {printFormat.toUpperCase()} PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Browser Print</span>
                </button>
                <a
                  href={buildWhatsAppBillLink(previewInv, previewItems, previewShop)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Clean White Paper Preview */}
            <div
              className={`print-surface mx-auto border border-slate-300 bg-white p-6 text-slate-900 ${
                printFormat === '80mm'
                  ? 'max-w-[330px] text-[11px]'
                  : printFormat === '58mm'
                  ? 'max-w-[250px] text-[10px]'
                  : printFormat === 'a5'
                  ? 'max-w-[560px] text-xs'
                  : 'max-w-[780px] text-xs'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#172554] pb-3">
                <div>
                  <h2 className="font-display text-lg font-bold uppercase text-[#172554]">
                    {settings?.businessName || 'PRAMANIK DIGITAL POINT'}
                  </h2>
                  <p className="text-slate-600">
                    {settings?.location || 'Singda, Dantan, Paschim Medinipur, West Bengal'}
                  </p>
                  <p className="font-mono text-slate-600">
                    Ph: {settings?.phone || '95933 53980'}
                    {settings?.gstin ? ` | GSTIN: ${settings.gstin}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display text-sm font-bold text-[#172554]">
                    {previewInv.status === 'draft' ? 'DRAFT / PROFORMA BILL' : 'WHOLESALE BILL'}
                  </div>
                  <div className="font-mono font-bold text-slate-900">{previewInv.invoiceNumber}</div>
                  <div className="font-mono text-slate-600">
                    Date: {formatDateDDMMYYYY(previewInv.invoiceDate)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Bill To:</div>
                  <div className="font-bold text-slate-900">{previewInv.shopName}</div>
                  <div className="text-slate-600">Ph: {previewInv.shopPhone || previewShop?.mobile || '-'}</div>
                  <div className="text-slate-600">{previewInv.shopAddress || '-'}</div>
                </div>
                <div className="text-right">
                  <div>
                    Status: <span className="font-bold">{previewInv.status.toUpperCase()}</span>
                  </div>
                  <div>
                    Payment: <span className="font-bold">{previewInv.paymentStatus.toUpperCase()}</span>
                  </div>
                  <div>Mode: {previewInv.paymentMethod.replace(/_/g, ' ').toUpperCase()}</div>
                </div>
              </div>

              <table className="mt-3 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-300 bg-slate-50 text-[#172554]">
                    <th className="py-1.5 pr-2">#</th>
                    <th className="py-1.5 pr-2">Item & Description</th>
                    <th className="py-1.5 px-2 text-right">Qty</th>
                    <th className="py-1.5 px-2 text-right">Rate</th>
                    <th className="py-1.5 pl-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {previewItems.map((it, i) => (
                    <tr key={it.id}>
                      <td className="py-1.5 pr-2 font-mono">{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <div className="font-semibold text-slate-900">{it.productName}</div>
                        {it.description && <div className="text-[10px] text-slate-500">{it.description}</div>}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {it.qty} {it.unit}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {formatINR(it.rate)}
                      </td>
                      <td className="py-1.5 pl-2 text-right font-mono font-semibold tabular-nums">
                        {formatINR(it.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-300 pt-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#172554]">Amount in Words:</div>
                  <div className="text-slate-700">{numberToIndianWords(previewInv.netTotal)}</div>
                  {previewInv.notes && (
                    <div className="pt-1 text-[11px] text-slate-500">Notes: {previewInv.notes}</div>
                  )}
                </div>
                <div className="space-y-1 text-right font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Subtotal:</span>
                    <span>{formatINR(previewInv.subtotal)}</span>
                  </div>
                  {previewInv.discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">Discount:</span>
                      <span>- {formatINR(previewInv.discount)}</span>
                    </div>
                  )}
                  {previewInv.transportCharge > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span className="font-sans">Transport:</span>
                      <span>{formatINR(previewInv.transportCharge)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold text-[#172554]">
                    <span className="font-sans">Net Total:</span>
                    <span>{formatINR(previewInv.netTotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="font-sans">Previous Outstanding:</span>
                    <span>{formatINR(previewInv.previousOutstanding)}</span>
                  </div>
                  <div className="flex justify-between text-[#16A34A]">
                    <span className="font-sans">Payment Received:</span>
                    <span>{formatINR(previewInv.paymentReceived)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[#DC2626]">
                    <span className="font-sans">Bill Balance Due:</span>
                    <span>{formatINR(previewInv.remainingDue)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex items-end justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                <span>Receiver Signature</span>
                <span>Authorized Signature — Pramanik Digital Point</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Collect Payment Against Confirmed Bill */}
      <Modal
        open={Boolean(payInv)}
        onClose={() => setPayInv(null)}
        title={`Record Payment — ${payInv?.invoiceNumber || ''}`}
        subtitle={`Shop: ${payInv?.shopName || ''} · Remaining Due: ${formatINR(payInv?.remainingDue || 0)}`}
      >
        <form onSubmit={handleCollectPayment} className="space-y-4 text-xs">
          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[#DC2626]">{err}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Amount Received (₹) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={payAmt}
                onChange={(e) => setPayAmt(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono font-bold"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Date *</label>
              <input
                type="date"
                required
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
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
                <option value="cash">Cash</option>
                <option value="upi">UPI / QR</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Reference / UTR</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Notes</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setPayInv(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#16A34A] px-5 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Bill Confirmation Modal */}
      <Modal
        open={Boolean(cancelInv)}
        onClose={() => setCancelInv(null)}
        title={`Cancel Bill — ${cancelInv?.invoiceNumber || ''}`}
        subtitle="Cancelling a confirmed bill atomically restores warehouse stock and reverses the customer's receivable balance."
      >
        <form onSubmit={handleCancelBill} className="space-y-4 text-xs">
          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[#DC2626]">{err}</div>}
          <div>
            <label className="mb-1 block font-semibold text-slate-700">Cancellation Reason *</label>
            <input
              type="text"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Explain why this invoice is being cancelled..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setCancelInv(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
            >
              Keep Bill
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#DC2626] px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
