import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { exportRowsToXLSX, exportTableToPDF } from '../../lib/exportUtils';
import { formatDateDDMMYYYY, formatINR } from '../../lib/formatters';

export const LedgersView: React.FC = () => {
  const { caps, shops, suppliers, sales, purchases, payments, returns, settings } = useErp();
  const [ledgerType, setLedgerType] = useState<'customer' | 'supplier'>('customer');
  const [selectedShopId, setSelectedShopId] = useState<string>(() => shops[0]?.id || '');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => suppliers[0]?.id || '');

  const activeShop = useMemo(
    () => shops.find((s) => s.id === selectedShopId) || shops[0] || null,
    [shops, selectedShopId]
  );

  const activeSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0] || null,
    [suppliers, selectedSupplierId]
  );

  const customerStatement = useMemo(() => {
    if (!activeShop) return { rows: [], closing: 0 };
    const entries: Array<{
      date: string;
      particulars: string;
      ref: string;
      debit: number;
      credit: number;
    }> = [];

    for (const s of sales) {
      if (s.shopId === activeShop.id && s.deliveryStatus !== 'reversed') {
        entries.push({
          date: s.saleDate,
          particulars:
            s.deliveryMethod === 'warehouse_dispatch'
              ? 'Warehouse Sale / Delivery'
              : `Direct Supplier Delivery (${s.supplierName || ''})`,
          ref: s.invoiceNumber,
          debit: s.netTotal,
          credit: 0,
        });
      }
    }
    for (const p of payments) {
      if (p.partyType === 'shop' && p.partyId === activeShop.id && p.status === 'active') {
        entries.push({
          date: p.paymentDate,
          particulars:
            p.paymentKind === 'credit_note'
              ? 'Credit Note / Discount'
              : p.paymentKind === 'refund'
              ? 'Refund Issued'
              : `Payment Received (${p.method.toUpperCase()})`,
          ref: p.receiptNumber,
          debit: p.paymentKind === 'refund' ? p.amount : 0,
          credit: p.paymentKind === 'refund' ? 0 : p.amount,
        });
      }
    }
    for (const r of returns) {
      if (r.returnType === 'shop_return' && r.partyId === activeShop.id && r.status === 'completed') {
        entries.push({
          date: r.returnDate,
          particulars: `Product Return (${r.productName} x${r.qty})`,
          ref: r.returnNumber,
          debit: 0,
          credit: r.totalValue,
        });
      }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
    let running = activeShop.openingBalance;
    const rows = entries.map((e) => {
      running = running + e.debit - e.credit;
      return { ...e, balance: running };
    });

    // Authoritative formula check: Opening Balance + Credit Sales + Other Debits - Payments Received - Credit Notes - Returns
    return { rows, closing: running };
  }, [activeShop, sales, payments, returns]);

  const supplierStatement = useMemo(() => {
    if (!activeSupplier) return { rows: [], closing: 0 };
    const entries: Array<{
      date: string;
      particulars: string;
      ref: string;
      purchases: number;
      payments: number;
    }> = [];

    for (const p of purchases) {
      if (p.supplierId === activeSupplier.id && p.status !== 'reversed') {
        entries.push({
          date: p.purchaseDate,
          particulars:
            p.purchaseType === 'direct_to_shop'
              ? `Direct-to-Shop Purchase (${p.targetShopName || ''})`
              : 'Warehouse Purchase',
          ref: p.invoiceNumber,
          purchases: p.totalCost,
          payments: 0,
        });
      }
    }
    for (const pay of payments) {
      if (pay.partyType === 'supplier' && pay.partyId === activeSupplier.id && pay.status === 'active') {
        entries.push({
          date: pay.paymentDate,
          particulars: `Payment Made (${pay.method.toUpperCase()})`,
          ref: pay.receiptNumber,
          purchases: pay.paymentKind === 'refund' ? pay.amount : 0,
          payments: pay.paymentKind === 'refund' ? 0 : pay.amount,
        });
      }
    }
    for (const r of returns) {
      if (r.returnType === 'supplier_return' && r.partyId === activeSupplier.id && r.status === 'completed') {
        entries.push({
          date: r.returnDate,
          particulars: `Purchase Return (${r.productName} x${r.qty})`,
          ref: r.returnNumber,
          purchases: 0,
          payments: r.totalValue,
        });
      }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
    let running = activeSupplier.openingBalance;
    const rows = entries.map((e) => {
      running = running + e.purchases - e.payments;
      return { ...e, balance: running };
    });
    return { rows, closing: running };
  }, [activeSupplier, purchases, payments, returns]);

  const handleExportCustomer = (kind: 'pdf' | 'xlsx') => {
    if (!activeShop) return;
    const headers = ['Date', 'Particulars', 'Reference', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'];
    const rows: Array<Array<string | number>> = [
      ['-', 'Opening Balance', '-', 0, 0, activeShop.openingBalance],
      ...customerStatement.rows.map((r) => [
        formatDateDDMMYYYY(r.date),
        r.particulars,
        r.ref,
        r.debit,
        r.credit,
        r.balance,
      ]),
    ];
    if (kind === 'xlsx') {
      exportRowsToXLSX(`ledger-${activeShop.shopName}.xlsx`, 'Customer Ledger', headers, rows);
    } else {
      exportTableToPDF(
        `ledger-${activeShop.shopName}.pdf`,
        `Customer Ledger: ${activeShop.shopName}`,
        `${activeShop.villageTown}, ${activeShop.blockArea} · Closing Balance: ${formatINR(customerStatement.closing)}`,
        headers,
        rows,
        settings
      );
    }
  };

  const handleExportSupplier = (kind: 'pdf' | 'xlsx') => {
    if (!activeSupplier) return;
    const headers = ['Date', 'Particulars', 'Reference', 'Purchases (INR)', 'Paid/Return (INR)', 'Payable (INR)'];
    const rows: Array<Array<string | number>> = [
      ['-', 'Opening Payable', '-', 0, 0, activeSupplier.openingBalance],
      ...supplierStatement.rows.map((r) => [
        formatDateDDMMYYYY(r.date),
        r.particulars,
        r.ref,
        r.purchases,
        r.payments,
        r.balance,
      ]),
    ];
    if (kind === 'xlsx') {
      exportRowsToXLSX(`supplier-ledger-${activeSupplier.name}.xlsx`, 'Supplier Ledger', headers, rows);
    } else {
      exportTableToPDF(
        `supplier-ledger-${activeSupplier.name}.pdf`,
        `Supplier Ledger: ${activeSupplier.name}`,
        `Closing Payable: ${formatINR(supplierStatement.closing)}`,
        headers,
        rows,
        settings
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setLedgerType('customer')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                ledgerType === 'customer' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Customer / Shop Ledger
            </button>
            {caps.canViewSupplierFinancials && (
              <button
                type="button"
                onClick={() => setLedgerType('supplier')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  ledgerType === 'supplier' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                Supplier Ledger
              </button>
            )}
          </div>

          {ledgerType === 'customer' ? (
            <select
              value={activeShop?.id || ''}
              onChange={(e) => setSelectedShopId(e.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shopName} ({s.blockArea})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={activeSupplier?.id || ''}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              ledgerType === 'customer' ? handleExportCustomer('pdf') : handleExportSupplier('pdf')
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>PDF Statement</span>
          </button>
          <button
            type="button"
            onClick={() =>
              ledgerType === 'customer' ? handleExportCustomer('xlsx') : handleExportSupplier('xlsx')
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Excel Statement</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      {ledgerType === 'customer' && activeShop && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Opening Balance</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {formatINR(activeShop.openingBalance)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">New Deliveries</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {formatINR(activeShop.totalPurchases)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Payments Received</div>
            <div className="mt-1 font-mono text-sm font-semibold text-emerald-700">
              {formatINR(activeShop.totalPayments)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Returns</div>
            <div className="mt-1 font-mono text-sm font-semibold text-blue-700">
              {formatINR(activeShop.totalReturns)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Credit Notes</div>
            <div className="mt-1 font-mono text-sm font-semibold text-blue-700">
              {formatINR(activeShop.totalCreditNotes)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Closing Outstanding</div>
            <div className="mt-1 font-mono text-sm font-semibold text-amber-700">
              {formatINR(activeShop.currentOutstanding)}
            </div>
          </div>
        </div>
      )}

      {ledgerType === 'supplier' && activeSupplier && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Opening Payable</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {formatINR(activeSupplier.openingBalance)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Purchases</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {formatINR(activeSupplier.totalPurchases)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Supplier Payments</div>
            <div className="mt-1 font-mono text-sm font-semibold text-emerald-700">
              {formatINR(activeSupplier.totalPayments)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Purchase Returns</div>
            <div className="mt-1 font-mono text-sm font-semibold text-blue-700">
              {formatINR(activeSupplier.totalReturns)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="text-[11px] text-slate-500">Closing Payable</div>
            <div className="mt-1 font-mono text-sm font-semibold text-red-700">
              {formatINR(activeSupplier.outstandingPayable)}
            </div>
          </div>
        </div>
      )}

      {/* Statement Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {ledgerType === 'customer' ? (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Particulars</th>
                <th className="px-4 py-3 font-medium">Ref No</th>
                <th className="px-4 py-3 text-right font-medium">Debit (+)</th>
                <th className="px-4 py-3 text-right font-medium">Credit (-)</th>
                <th className="px-4 py-3 text-right font-medium">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeShop && (
                <tr>
                  <td className="px-4 py-2.5 text-slate-400">-</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">Opening Balance</td>
                  <td className="px-4 py-2.5">-</td>
                  <td className="px-4 py-2.5 text-right font-mono">-</td>
                  <td className="px-4 py-2.5 text-right font-mono">-</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {formatINR(activeShop.openingBalance)}
                  </td>
                </tr>
              )}
              {customerStatement.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-slate-600">
                    {formatDateDDMMYYYY(r.date)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-800">{r.particulars}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{r.ref}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                    {r.debit > 0 ? formatINR(r.debit) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">
                    {r.credit > 0 ? formatINR(r.credit) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {formatINR(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Particulars</th>
                <th className="px-4 py-3 font-medium">Ref No</th>
                <th className="px-4 py-3 text-right font-medium">Purchases (+)</th>
                <th className="px-4 py-3 text-right font-medium">Paid / Returns (-)</th>
                <th className="px-4 py-3 text-right font-medium">Running Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeSupplier && (
                <tr>
                  <td className="px-4 py-2.5 text-slate-400">-</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">Opening Payable</td>
                  <td className="px-4 py-2.5">-</td>
                  <td className="px-4 py-2.5 text-right font-mono">-</td>
                  <td className="px-4 py-2.5 text-right font-mono">-</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {formatINR(activeSupplier.openingBalance)}
                  </td>
                </tr>
              )}
              {supplierStatement.rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-slate-600">
                    {formatDateDDMMYYYY(r.date)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-800">{r.particulars}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">{r.ref}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                    {r.purchases > 0 ? formatINR(r.purchases) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-emerald-700">
                    {r.payments > 0 ? formatINR(r.payments) : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                    {formatINR(r.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
