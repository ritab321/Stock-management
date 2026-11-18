import React, { useMemo, useState } from 'react';
import { Plus, Printer, RotateCcw, Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import {
  recordBillPaymentTransaction,
  recordPaymentTransaction,
  reversePaymentTransaction,
} from '../../lib/erpService';
import { generatePaymentReceiptPDF } from '../../lib/exportUtils';
import { formatDateDDMMYYYY, formatINR, getTodayIST } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { Payment, PaymentKind, PaymentMethod } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const PaymentsView: React.FC = () => {
  const { profile, caps, lang, payments, shops, suppliers, sales, invoices, purchases, settings } =
    useErp();
  const [search, setSearch] = useState('');
  const [partyFilter, setPartyFilter] = useState<'all' | 'shop' | 'supplier'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    partyType: 'shop' as 'shop' | 'supplier',
    partyId: '',
    paymentDate: getTodayIST(),
    amount: 0,
    method: 'upi' as PaymentMethod,
    paymentKind: 'partial' as PaymentKind,
    referenceNo: '',
    linkedInvoiceKey: '',
    notes: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments
      .filter((p) => {
        if (partyFilter !== 'all' && p.partyType !== partyFilter) return false;
        if (!q) return true;
        return (
          p.receiptNumber.toLowerCase().includes(q) ||
          p.partyName.toLowerCase().includes(q) ||
          (p.referenceNo || '').toLowerCase().includes(q) ||
          (p.linkedInvoiceNo || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [payments, search, partyFilter]);

  const openModal = () => {
    setErr(null);
    const firstShop = shops.find((s) => s.status === 'active');
    setForm({
      partyType: 'shop',
      partyId: firstShop?.id || '',
      paymentDate: getTodayIST(),
      amount: 0,
      method: 'upi',
      paymentKind: 'partial',
      referenceNo: '',
      linkedInvoiceKey: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const partyInvoices = useMemo(() => {
    if (form.partyType === 'shop') {
      const fromSales = sales
        .filter((s) => s.shopId === form.partyId && s.deliveryStatus !== 'reversed' && s.remainingDue > 0)
        .map((s) => ({
          key: `sale:${s.id}`,
          label: `[Dispatch] ${s.invoiceNumber}`,
          remainingDue: s.remainingDue,
        }));
      const fromBills = invoices
        .filter((inv) => inv.shopId === form.partyId && inv.status === 'confirmed' && inv.remainingDue > 0)
        .map((inv) => ({
          key: `bill:${inv.id}`,
          label: `[Bill Book] ${inv.invoiceNumber}`,
          remainingDue: inv.remainingDue,
        }));
      return [...fromBills, ...fromSales];
    }
    return purchases
      .filter((p) => p.supplierId === form.partyId && p.status !== 'reversed' && p.remainingDue > 0)
      .map((p) => ({
        key: `pur:${p.id}`,
        label: p.invoiceNumber,
        remainingDue: p.remainingDue,
      }));
  }, [form.partyType, form.partyId, sales, invoices, purchases]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form.partyId) return;
    if (form.amount <= 0) {
      setErr('Payment amount must be greater than zero.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (form.partyType === 'shop' && form.linkedInvoiceKey.startsWith('bill:')) {
        const billId = form.linkedInvoiceKey.slice(5);
        await recordBillPaymentTransaction(
          { uid: profile.uid, displayName: profile.displayName, role: profile.role },
          billId,
          form.amount,
          form.paymentDate,
          form.method,
          form.referenceNo,
          form.notes
        );
      } else {
        const rawLinkedId = form.linkedInvoiceKey.includes(':')
          ? form.linkedInvoiceKey.split(':')[1]
          : form.linkedInvoiceKey || undefined;
        await recordPaymentTransaction(
          { uid: profile.uid, displayName: profile.displayName, role: profile.role },
          {
            partyType: form.partyType,
            partyId: form.partyId,
            paymentDate: form.paymentDate,
            amount: form.amount,
            method: form.method,
            paymentKind: form.paymentKind,
            referenceNo: form.referenceNo,
            linkedInvoiceId: rawLinkedId,
            notes: form.notes,
          }
        );
      }
      setModalOpen(false);
    } catch (payErr) {
      setErr(payErr instanceof Error ? payErr.message : 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !reverseTarget || !reverseReason.trim()) return;
    setSaving(true);
    try {
      await reversePaymentTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        reverseTarget.id,
        reverseReason
      );
      setReverseTarget(null);
      setReverseReason('');
    } catch (revErr) {
      setErr(revErr instanceof Error ? revErr.message : 'Reversal failed.');
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
              placeholder="Search receipt, party, UTR, invoice..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs focus:border-green-600 focus:outline-none"
            />
          </div>
          {caps.canRecordSupplierPayments && (
            <select
              value={partyFilter}
              onChange={(e) => setPartyFilter(e.target.value as typeof partyFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              <option value="all">All Parties</option>
              <option value="shop">Customer Receipts</option>
              <option value="supplier">Supplier Payments</option>
            </select>
          )}
        </div>

        {(caps.canRecordShopPayments || caps.canRecordSupplierPayments) && (
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-green-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Payment / Receipt</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Receipt & Date</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Kind & Method</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Reference / Linked Inv</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
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
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-slate-900">{p.receiptNumber}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {formatDateDDMMYYYY(p.paymentDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.partyName}</div>
                    <div className="text-[11px] text-slate-500">
                      {p.partyType === 'shop' ? 'Customer' : 'Supplier'} · By {p.createdByName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{p.paymentKind.replace(/_/g, ' ').toUpperCase()}</div>
                    <div className="text-[11px] text-slate-400">
                      {p.method.replace(/_/g, ' ').toUpperCase()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {formatINR(p.amount)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                    <div>{p.referenceNo || '-'}</div>
                    <div className="text-slate-400">{p.linkedInvoiceNo || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold ${
                        p.status === 'active' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {p.status.toUpperCase()}
                    </span>
                    {p.reversalReason && (
                      <div className="text-[10px] text-red-500">{p.reversalReason}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => generatePaymentReceiptPDF(p, settings)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Printer className="h-3 w-3" />
                        <span>Receipt</span>
                      </button>
                      {p.status === 'active' && caps.canReverseFinancials && (
                        <button
                          type="button"
                          onClick={() => {
                            setReverseTarget(p);
                            setReverseReason('');
                          }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reverse</span>
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

      {/* Record Payment Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Customer or Supplier Payment"
        subtitle="Payments update account balances atomically and cannot be silently deleted."
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Account Type *</label>
              <select
                value={form.partyType}
                onChange={(e) => {
                  const pt = e.target.value as 'shop' | 'supplier';
                  const firstId = pt === 'shop' ? shops[0]?.id || '' : suppliers[0]?.id || '';
                  setForm({ ...form, partyType: pt, partyId: firstId, linkedInvoiceKey: '' });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="shop">Customer / Retail Shop (Receipt)</option>
                {caps.canRecordSupplierPayments && (
                  <option value="supplier">Supplier (Payable Settlement)</option>
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                {form.partyType === 'shop' ? 'Select Shop *' : 'Select Supplier *'}
              </label>
              <select
                required
                value={form.partyId}
                onChange={(e) =>
                  setForm({ ...form, partyId: e.target.value, linkedInvoiceKey: '' })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select Account</option>
                {form.partyType === 'shop'
                  ? shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shopName} (Due: {formatINR(s.currentOutstanding)})
                      </option>
                    ))
                  : suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Payable: {formatINR(s.outstandingPayable)})
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Date *</label>
              <input
                type="date"
                required
                value={form.paymentDate}
                onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Amount (₹) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Method *</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as PaymentMethod })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Entry Type *</label>
              <select
                value={form.paymentKind}
                onChange={(e) => setForm({ ...form, paymentKind: e.target.value as PaymentKind })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="partial">Partial Payment</option>
                <option value="full">Full Payment</option>
                <option value="advance">Advance Payment</option>
                <option value="credit_note">Credit Note / Discount</option>
                <option value="refund">Refund Issued</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Transaction Reference / UTR
              </label>
              <input
                type="text"
                value={form.referenceNo}
                onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Link Unpaid Invoice (Optional)
              </label>
              <select
                value={form.linkedInvoiceKey}
                onChange={(e) => {
                  const key = e.target.value;
                  const match = partyInvoices.find((inv) => inv.key === key);
                  setForm({
                    ...form,
                    linkedInvoiceKey: key,
                    amount: match && form.amount === 0 ? match.remainingDue : form.amount,
                  });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">General Account Payment</option>
                {partyInvoices.map((inv) => (
                  <option key={inv.key} value={inv.key}>
                    {inv.label} — Due {formatINR(inv.remainingDue)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Recording...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Authorized Reversal Modal */}
      <Modal
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title={`Reverse Payment — ${reverseTarget?.receiptNumber || ''}`}
        subtitle="Reversing creates an audit trail and restores the party's previous balance."
        size="md"
      >
        <form onSubmit={handleReverse} className="space-y-4 text-xs">
          <div>
            <label className="mb-1 block font-medium text-slate-700">
              Mandatory Reversal Reason *
            </label>
            <input
              type="text"
              required
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g., UPI transaction failed / bounced cheque"
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setReverseTarget(null)}
              className="rounded-lg border border-slate-200 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
            >
              {saving ? 'Reversing...' : 'Confirm Reversal'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
