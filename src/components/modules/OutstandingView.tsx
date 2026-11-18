import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  MessageCircle,
  Search,
  Store,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { recordPaymentTransaction } from '../../lib/erpService';
import { exportRowsToXLSX, exportTableToPDF } from '../../lib/exportUtils';
import { addDaysIST, formatDateDDMMYYYY, formatINR, getTodayIST } from '../../lib/formatters';
import type { NavTab, PaymentMethod } from '../../types/erp';
import { Modal } from '../ui/Modal';

interface OutstandingViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const OutstandingView: React.FC<OutstandingViewProps> = ({ onNavigate }) => {
  const { profile, caps, shops, suppliers, settings } = useErp();

  const [partyTab, setPartyTab] = useState<'customers' | 'suppliers'>('customers');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'overlimit'>('all');
  const [search, setSearch] = useState('');

  // Quick Settle Modal
  const [settleModal, setSettleModal] = useState<{
    partyType: 'shop' | 'supplier';
    partyId: string;
    partyName: string;
    dueAmount: number;
  } | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(getTodayIST());
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const overdueCutoff = addDaysIST(getTodayIST(), -14);

  const customerDues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shops
      .filter((s) => s.currentOutstanding > 0.01)
      .filter((s) => {
        const isOverdue = Boolean(s.lastDeliveryDate && s.lastDeliveryDate < overdueCutoff);
        const isOverLimit = s.creditLimit > 0 && s.currentOutstanding > s.creditLimit;
        if (statusFilter === 'overdue' && !isOverdue) return false;
        if (statusFilter === 'overlimit' && !isOverLimit) return false;
        if (!q) return true;
        return (
          s.shopName.toLowerCase().includes(q) ||
          s.ownerName.toLowerCase().includes(q) ||
          s.mobile.toLowerCase().includes(q) ||
          s.blockArea.toLowerCase().includes(q) ||
          s.villageTown.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.currentOutstanding - a.currentOutstanding);
  }, [shops, search, statusFilter, overdueCutoff]);

  const supplierDues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers
      .filter((s) => s.outstandingPayable > 0.01)
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          (s.contactPerson || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.outstandingPayable - a.outstandingPayable);
  }, [suppliers, search]);

  const totals = useMemo(() => {
    const totalReceivable = shops.reduce((sum, s) => sum + Math.max(0, s.currentOutstanding), 0);
    const overdueCount = shops.filter(
      (s) => s.currentOutstanding > 0 && s.lastDeliveryDate && s.lastDeliveryDate < overdueCutoff
    ).length;
    const overLimitCount = shops.filter(
      (s) => s.creditLimit > 0 && s.currentOutstanding > s.creditLimit
    ).length;
    const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, s.outstandingPayable), 0);
    return { totalReceivable, overdueCount, overLimitCount, totalPayable };
  }, [shops, suppliers, overdueCutoff]);

  const openSettle = (
    partyType: 'shop' | 'supplier',
    partyId: string,
    partyName: string,
    dueAmount: number
  ) => {
    setSettleModal({ partyType, partyId, partyName, dueAmount });
    setPayAmount(dueAmount);
    setPayDate(getTodayIST());
    setPayMethod(partyType === 'shop' ? 'cash' : 'bank_transfer');
    setPayRef('');
    setPayNotes('Outstanding settlement');
    setErr(null);
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !settleModal) return;
    setSaving(true);
    setErr(null);
    try {
      await recordPaymentTransaction(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          partyType: settleModal.partyType,
          partyId: settleModal.partyId,
          paymentDate: payDate,
          amount: payAmount,
          method: payMethod,
          paymentKind: payAmount >= settleModal.dueAmount - 0.01 ? 'full' : 'partial',
          referenceNo: payRef,
          notes: payNotes,
        }
      );
      setSettleModal(null);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to record settlement.');
    } finally {
      setSaving(false);
    }
  };

  const buildReminderLink = (shopName: string, phone: string, amount: number) => {
    const clean = phone.replace(/\D/g, '');
    const num = clean.length === 10 ? `91${clean}` : clean;
    const msg = encodeURIComponent(
      `Namaskar ${shopName},\nReminder from *Pramanik Digital Point* (Ph: ${settings?.phone || '95933 53980'}).\nYour current outstanding balance is *${formatINR(amount)}*. Kindly arrange payment at your earliest convenience. Thank you!`
    );
    return num ? `https://wa.me/${num}?text=${msg}` : `https://wa.me/?text=${msg}`;
  };

  const handleExport = (kind: 'pdf' | 'xlsx') => {
    if (partyTab === 'customers') {
      const headers = ['Shop Name', 'Owner', 'Mobile', 'Village / Block', 'Credit Limit', 'Outstanding', 'Last Delivery'];
      const rows = customerDues.map((s) => [
        s.shopName,
        s.ownerName,
        s.mobile,
        `${s.villageTown}, ${s.blockArea}`,
        s.creditLimit,
        s.currentOutstanding,
        formatDateDDMMYYYY(s.lastDeliveryDate),
      ]);
      if (kind === 'pdf') {
        exportTableToPDF('customer-outstanding.pdf', 'Customer Outstanding Receivables', 'Pramanik Digital Point', headers, rows, settings);
      } else {
        exportRowsToXLSX('customer-outstanding.xlsx', 'Receivables', headers, rows);
      }
    } else {
      const headers = ['Supplier Name', 'Contact Person', 'Phone', 'Total Purchases', 'Payments Made', 'Payable Due'];
      const rows = supplierDues.map((s) => [
        s.name,
        s.contactPerson || '-',
        s.phone,
        s.totalPurchases,
        s.totalPayments,
        s.outstandingPayable,
      ]);
      if (kind === 'pdf') {
        exportTableToPDF('supplier-outstanding.pdf', 'Supplier Outstanding Payables', 'Pramanik Digital Point', headers, rows, settings);
      } else {
        exportRowsToXLSX('supplier-outstanding.xlsx', 'Payables', headers, rows);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Executive Outstanding Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-[#0B1221] via-[#121F3B] to-[#1A2F5A] p-4 text-white shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <span>Customer Receivables</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-amber-300">
              <Store className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">
            {formatINR(totals.totalReceivable)}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-300">{customerDues.length} shops with open due</p>
        </div>

        <div className="erp-card rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Overdue (&gt;14 Days)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-[#0B1221] tabular-nums">{totals.overdueCount}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">{totals.overLimitCount} shops over credit limit</p>
        </div>

        {caps.canViewSupplierFinancials && (
          <div className="erp-card rounded-xl p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Supplier Payables</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <Building2 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-[#0B1221] tabular-nums">
              {formatINR(totals.totalPayable)}
            </p>
            <p className="mt-1.5 text-[11px] text-slate-500">{supplierDues.length} suppliers with open payable</p>
          </div>
        )}

        {caps.canViewSupplierFinancials && (
          <div className="erp-card rounded-xl p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>Net Position (Rec - Pay)</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-[#0B1221] tabular-nums">
              {formatINR(totals.totalReceivable - totals.totalPayable)}
            </p>
            <p className="mt-1.5 text-[11px] text-slate-500">Working balance spread</p>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPartyTab('customers')}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
                partyTab === 'customers' ? 'bg-[#EA580C] text-white' : 'text-slate-600'
              }`}
            >
              Customer Receivables ({customerDues.length})
            </button>
            {caps.canViewSupplierFinancials && (
              <button
                type="button"
                onClick={() => setPartyTab('suppliers')}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${
                  partyTab === 'suppliers' ? 'bg-[#EA580C] text-white' : 'text-slate-600'
                }`}
              >
                Supplier Payables ({supplierDues.length})
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, area..."
              className="w-64 rounded-lg border border-slate-200 py-1.5 pl-9 pr-3 text-xs"
            />
          </div>

          {partyTab === 'customers' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
            >
              <option value="all">All Receivables</option>
              <option value="overdue">Overdue (&gt;14 Days)</option>
              <option value="overlimit">Credit Limit Exceeded</option>
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#16A34A] hover:bg-emerald-50"
          >
            Payment History
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {partyTab === 'customers' ? (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Shop & Owner</th>
                <th className="px-4 py-3 font-medium">Area (Paschim Medinipur)</th>
                <th className="px-4 py-3 font-medium">Last Delivery</th>
                <th className="px-4 py-3 text-right font-medium">Credit Limit</th>
                <th className="px-4 py-3 text-right font-medium">Outstanding Due</th>
                <th className="px-4 py-3 font-medium">Alert Flag</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customerDues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No customer receivables match the selected filter.
                  </td>
                </tr>
              ) : (
                customerDues.map((s) => {
                  const isOverdue = Boolean(s.lastDeliveryDate && s.lastDeliveryDate < overdueCutoff);
                  const isOverLimit = s.creditLimit > 0 && s.currentOutstanding > s.creditLimit;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{s.shopName}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.ownerName} · <span className="font-mono">{s.mobile}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.villageTown}, {s.blockArea}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {formatDateDDMMYYYY(s.lastDeliveryDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                        {formatINR(s.creditLimit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#EA580C] tabular-nums">
                        {formatINR(s.currentOutstanding)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {isOverLimit ? (
                          <span className="text-[#DC2626]">Over Credit Limit</span>
                        ) : isOverdue ? (
                          <span className="text-amber-700">Overdue (&gt;14d)</span>
                        ) : (
                          <span className="text-slate-500">Current</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={buildReminderLink(s.shopName, s.whatsapp || s.mobile, s.currentOutstanding)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-[#16A34A] hover:bg-emerald-50"
                          >
                            <MessageCircle className="h-3 w-3" />
                            <span>Remind</span>
                          </a>
                          {caps.canRecordShopPayments && (
                            <button
                              type="button"
                              onClick={() => openSettle('shop', s.id, s.shopName, s.currentOutstanding)}
                              className="rounded bg-[#EA580C] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-700"
                            >
                              Collect
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
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 text-right font-medium">Total Purchases</th>
                <th className="px-4 py-3 text-right font-medium">Payments Made</th>
                <th className="px-4 py-3 text-right font-medium">Payable Due</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {supplierDues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    All supplier accounts are settled.
                  </td>
                </tr>
              ) : (
                supplierDues.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{sup.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {sup.contactPerson || '-'} · <span className="font-mono">{sup.phone}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatINR(sup.totalPurchases)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#16A34A] tabular-nums">
                      {formatINR(sup.totalPayments)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#DC2626] tabular-nums">
                      {formatINR(sup.outstandingPayable)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {caps.canRecordSupplierPayments && (
                        <button
                          type="button"
                          onClick={() => openSettle('supplier', sup.id, sup.name, sup.outstandingPayable)}
                          className="rounded bg-[#DC2626] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
                        >
                          Pay Supplier
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Settlement Modal */}
      <Modal
        open={Boolean(settleModal)}
        onClose={() => setSettleModal(null)}
        title={`Settle Outstanding — ${settleModal?.partyName || ''}`}
        subtitle={`Current Due Balance: ${formatINR(settleModal?.dueAmount || 0)}`}
      >
        <form onSubmit={handleSettle} className="space-y-4 text-xs">
          {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[#DC2626]">{err}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Payment Amount (₹) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
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
              onClick={() => setSettleModal(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#EA580C] px-5 py-2 font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? 'Processing...' : 'Confirm Settlement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
