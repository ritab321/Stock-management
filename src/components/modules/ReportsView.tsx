import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { exportRowsToCSV, exportRowsToXLSX, exportTableToPDF } from '../../lib/exportUtils';
import {
  formatDateDDMMYYYY,
  formatINR,
  formatTimestampIST,
  getTodayIST,
  isDateInRange,
} from '../../lib/formatters';

type ReportId =
  | 'daily_sales'
  | 'monthly_sales'
  | 'shop_sales'
  | 'product_sales'
  | 'warehouse_stock'
  | 'stock_movement'
  | 'direct_delivery'
  | 'purchase_report'
  | 'shop_outstanding'
  | 'supplier_outstanding'
  | 'payment_collection'
  | 'gross_profit'
  | 'damaged_stock'
  | 'returns_report'
  | 'user_activity'
  | 'location_analytics';

const REPORT_LIST: Array<{ id: ReportId; label: string; requiresProfit?: boolean }> = [
  { id: 'daily_sales', label: '1. Daily Sales Report' },
  { id: 'monthly_sales', label: '2. Monthly Sales Report' },
  { id: 'shop_sales', label: '3. Shop-wise Sales Report' },
  { id: 'product_sales', label: '4. Product-wise Sales Report' },
  { id: 'warehouse_stock', label: '5. Warehouse Stock Report' },
  { id: 'stock_movement', label: '6. Stock Movement Report' },
  { id: 'direct_delivery', label: '7. Direct Delivery Report' },
  { id: 'purchase_report', label: '8. Purchase Report' },
  { id: 'shop_outstanding', label: '9. Shop Outstanding Report' },
  { id: 'supplier_outstanding', label: '10. Supplier Outstanding Report' },
  { id: 'payment_collection', label: '11. Payment Collection Report' },
  { id: 'gross_profit', label: '12. Gross Profit Report', requiresProfit: true },
  { id: 'damaged_stock', label: '13. Damaged Stock Report' },
  { id: 'returns_report', label: '14. Returns Report' },
  { id: 'user_activity', label: '15. User Activity Report' },
  { id: 'location_analytics', label: '16. Paschim Medinipur Area Report' },
];

export const ReportsView: React.FC = () => {
  const {
    caps,
    products,
    suppliers,
    shops,
    purchases,
    sales,
    saleItems,
    stockMovements,
    payments,
    returns,
    auditLogs,
    settings,
  } = useErp();

  const [reportId, setReportId] = useState<ReportId>('daily_sales');
  const [dateFrom, setDateFrom] = useState(() => `${getTodayIST().slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(() => getTodayIST());
  const [shopFilter, setShopFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [groupByLoc, setGroupByLoc] = useState<'district' | 'blockArea' | 'villageTown' | 'route'>(
    'blockArea'
  );

  const visibleReports = useMemo(
    () => REPORT_LIST.filter((r) => !r.requiresProfit || caps.canViewProfitMetrics),
    [caps.canViewProfitMetrics]
  );

  const blocks = useMemo(
    () => Array.from(new Set(shops.map((s) => s.blockArea).filter(Boolean))).sort(),
    [shops]
  );
  const staffNames = useMemo(
    () => Array.from(new Set(auditLogs.map((a) => a.userName).filter(Boolean))).sort(),
    [auditLogs]
  );

  const reportData = useMemo<{
    title: string;
    headers: string[];
    rows: Array<Array<string | number>>;
  }>(() => {
    const shopById = new Map(shops.map((s) => [s.id, s]));
    const filteredSales = sales.filter((s) => {
      if (s.deliveryStatus === 'reversed') return false;
      if (!isDateInRange(s.saleDate, dateFrom, dateTo)) return false;
      if (shopFilter !== 'all' && s.shopId !== shopFilter) return false;
      if (supplierFilter !== 'all' && s.supplierId !== supplierFilter) return false;
      if (blockFilter !== 'all' && s.shopBlock !== blockFilter) return false;
      if (userFilter !== 'all' && s.createdByName !== userFilter) return false;
      return true;
    });

    switch (reportId) {
      case 'daily_sales': {
        const map = new Map<string, { count: number; net: number; paid: number; due: number; profit: number }>();
        for (const s of filteredSales) {
          const c = map.get(s.saleDate) || { count: 0, net: 0, paid: 0, due: 0, profit: 0 };
          c.count += 1;
          c.net += s.netTotal;
          c.paid += s.paymentReceived;
          c.due += s.remainingDue;
          c.profit += s.grossProfit;
          map.set(s.saleDate, c);
        }
        const headers = ['Date', 'Invoices', 'Net Sales (₹)', 'Collected (₹)', 'Due (₹)', ...(caps.canViewProfitMetrics ? ['Gross Profit (₹)'] : [])];
        const rows = Array.from(map.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([dt, v]) => [
            formatDateDDMMYYYY(dt),
            v.count,
            v.net.toFixed(2),
            v.paid.toFixed(2),
            v.due.toFixed(2),
            ...(caps.canViewProfitMetrics ? [v.profit.toFixed(2)] : []),
          ]);
        return { title: 'Daily Sales Report', headers, rows };
      }

      case 'monthly_sales': {
        const map = new Map<string, { count: number; net: number; paid: number; profit: number }>();
        for (const s of filteredSales) {
          const mo = s.saleDate.slice(0, 7);
          const c = map.get(mo) || { count: 0, net: 0, paid: 0, profit: 0 };
          c.count += 1;
          c.net += s.netTotal;
          c.paid += s.paymentReceived;
          c.profit += s.grossProfit;
          map.set(mo, c);
        }
        const headers = ['Month', 'Invoices', 'Net Sales (₹)', 'Collected (₹)', ...(caps.canViewProfitMetrics ? ['Gross Profit (₹)'] : [])];
        const rows = Array.from(map.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([mo, v]) => [
            mo,
            v.count,
            v.net.toFixed(2),
            v.paid.toFixed(2),
            ...(caps.canViewProfitMetrics ? [v.profit.toFixed(2)] : []),
          ]);
        return { title: 'Monthly Sales Report', headers, rows };
      }

      case 'shop_sales': {
        const map = new Map<string, { name: string; area: string; count: number; net: number; due: number }>();
        for (const s of filteredSales) {
          const c = map.get(s.shopId) || {
            name: s.shopName,
            area: s.shopBlock || '-',
            count: 0,
            net: 0,
            due: 0,
          };
          c.count += 1;
          c.net += s.netTotal;
          c.due += s.remainingDue;
          map.set(s.shopId, c);
        }
        return {
          title: 'Shop-wise Sales Report',
          headers: ['Shop Name', 'Block / Area', 'Invoices', 'Total Sales (₹)', 'Invoice Due (₹)'],
          rows: Array.from(map.values())
            .sort((a, b) => b.net - a.net)
            .map((v) => [v.name, v.area, v.count, v.net.toFixed(2), v.due.toFixed(2)]),
        };
      }

      case 'product_sales': {
        const saleIds = new Set(filteredSales.map((s) => s.id));
        const map = new Map<string, { name: string; sku: string; qty: number; rev: number; profit: number }>();
        for (const it of saleItems) {
          if (!saleIds.has(it.saleId)) continue;
          if (productFilter !== 'all' && it.productId !== productFilter) continue;
          const c = map.get(it.productId) || {
            name: it.productName,
            sku: it.sku,
            qty: 0,
            rev: 0,
            profit: 0,
          };
          c.qty += it.orderedQty;
          c.rev += it.lineTotal;
          c.profit += it.lineProfit;
          map.set(it.productId, c);
        }
        return {
          title: 'Product-wise Sales Report',
          headers: ['Product', 'SKU', 'Qty Sold', 'Sales Revenue (₹)', ...(caps.canViewProfitMetrics ? ['Profit (₹)'] : [])],
          rows: Array.from(map.values())
            .sort((a, b) => b.rev - a.rev)
            .map((v) => [
              v.name,
              v.sku,
              v.qty,
              v.rev.toFixed(2),
              ...(caps.canViewProfitMetrics ? [v.profit.toFixed(2)] : []),
            ]),
        };
      }

      case 'warehouse_stock': {
        const list = products.filter((p) => productFilter === 'all' || p.id === productFilter);
        return {
          title: 'Warehouse Stock Report',
          headers: ['Product', 'SKU', 'Zone', 'Sellable Qty', 'Damaged Qty', 'Min Alert', ...(caps.canViewPurchasePrices ? ['Stock Value (₹)'] : [])],
          rows: list.map((p) => [
            p.name,
            p.sku,
            p.warehouseZone || 'Main Rack A',
            `${p.availableQty} ${p.unit}`,
            p.damagedQty,
            p.minStockAlert,
            ...(caps.canViewPurchasePrices ? [(p.availableQty * p.purchasePrice).toFixed(2)] : []),
          ]),
        };
      }

      case 'stock_movement': {
        const list = stockMovements.filter(
          (m) =>
            isDateInRange(m.date, dateFrom, dateTo) &&
            (productFilter === 'all' || m.productId === productFilter) &&
            (userFilter === 'all' || m.createdByName === userFilter)
        );
        return {
          title: 'Stock Movement Report',
          headers: ['Date', 'Product', 'Type', 'Direction', 'Qty', 'Ref', 'User'],
          rows: list.map((m) => [
            formatDateDDMMYYYY(m.date),
            m.productName,
            m.movementType,
            m.direction,
            m.qty,
            m.referenceNumber || '-',
            m.createdByName,
          ]),
        };
      }

      case 'direct_delivery': {
        const list = filteredSales.filter((s) => s.deliveryMethod === 'direct_supplier_dispatch');
        return {
          title: 'Direct Supplier Delivery Report',
          headers: ['Date', 'Invoice', 'Supplier', 'Shop', 'Sale Total (₹)', ...(caps.canViewProfitMetrics ? ['Cost (₹)', 'Gross Profit (₹)'] : [])],
          rows: list.map((s) => [
            formatDateDDMMYYYY(s.saleDate),
            s.invoiceNumber,
            s.supplierName || '-',
            s.shopName,
            s.netTotal.toFixed(2),
            ...(caps.canViewProfitMetrics ? [s.totalCost.toFixed(2), s.grossProfit.toFixed(2)] : []),
          ]),
        };
      }

      case 'purchase_report': {
        const list = purchases.filter(
          (p) =>
            p.status !== 'reversed' &&
            isDateInRange(p.purchaseDate, dateFrom, dateTo) &&
            (supplierFilter === 'all' || p.supplierId === supplierFilter) &&
            (userFilter === 'all' || p.createdByName === userFilter)
        );
        return {
          title: 'Purchase Report',
          headers: ['Date', 'Invoice', 'Supplier', 'Type', 'Total Cost (₹)', 'Paid (₹)', 'Due (₹)'],
          rows: list.map((p) => [
            formatDateDDMMYYYY(p.purchaseDate),
            p.invoiceNumber,
            p.supplierName,
            p.purchaseType,
            p.totalCost.toFixed(2),
            p.amountPaid.toFixed(2),
            p.remainingDue.toFixed(2),
          ]),
        };
      }

      case 'shop_outstanding': {
        const list = shops
          .filter(
            (s) =>
              (shopFilter === 'all' || s.id === shopFilter) &&
              (blockFilter === 'all' || s.blockArea === blockFilter)
          )
          .sort((a, b) => b.currentOutstanding - a.currentOutstanding);
        return {
          title: 'Shop Outstanding Report',
          headers: ['Shop Name', 'Village / Block', 'Mobile', 'Credit Limit (₹)', 'Outstanding (₹)', 'Last Delivery'],
          rows: list.map((s) => [
            s.shopName,
            `${s.villageTown}, ${s.blockArea}`,
            s.mobile,
            s.creditLimit.toFixed(2),
            s.currentOutstanding.toFixed(2),
            formatDateDDMMYYYY(s.lastDeliveryDate),
          ]),
        };
      }

      case 'supplier_outstanding': {
        const list = suppliers
          .filter((s) => supplierFilter === 'all' || s.id === supplierFilter)
          .sort((a, b) => b.outstandingPayable - a.outstandingPayable);
        return {
          title: 'Supplier Outstanding Report',
          headers: ['Supplier', 'Phone', 'Total Purchases (₹)', 'Payments Made (₹)', 'Outstanding Payable (₹)'],
          rows: list.map((s) => [
            s.name,
            s.phone,
            s.totalPurchases.toFixed(2),
            s.totalPayments.toFixed(2),
            s.outstandingPayable.toFixed(2),
          ]),
        };
      }

      case 'payment_collection': {
        const list = payments.filter(
          (p) =>
            p.status === 'active' &&
            p.partyType === 'shop' &&
            isDateInRange(p.paymentDate, dateFrom, dateTo) &&
            (shopFilter === 'all' || p.partyId === shopFilter) &&
            (userFilter === 'all' || p.createdByName === userFilter)
        );
        return {
          title: 'Payment Collection Report',
          headers: ['Date', 'Receipt No', 'Shop', 'Method', 'Kind', 'Amount (₹)', 'Received By'],
          rows: list.map((p) => [
            formatDateDDMMYYYY(p.paymentDate),
            p.receiptNumber,
            p.partyName,
            p.method.toUpperCase(),
            p.paymentKind,
            p.amount.toFixed(2),
            p.createdByName,
          ]),
        };
      }

      case 'gross_profit': {
        return {
          title: 'Gross Profit Report',
          headers: ['Date', 'Invoice', 'Shop', 'Method', 'Net Sales (₹)', 'COGS (₹)', 'Gross Profit (₹)'],
          rows: filteredSales.map((s) => [
            formatDateDDMMYYYY(s.saleDate),
            s.invoiceNumber,
            s.shopName,
            s.deliveryMethod === 'warehouse_dispatch' ? 'Warehouse' : 'Direct',
            s.netTotal.toFixed(2),
            s.totalCost.toFixed(2),
            s.grossProfit.toFixed(2),
          ]),
        };
      }

      case 'damaged_stock': {
        const list = products.filter((p) => p.damagedQty > 0);
        return {
          title: 'Damaged Stock Report',
          headers: ['Product', 'SKU', 'Damaged Qty', 'Sellable Qty', 'Zone', ...(caps.canViewPurchasePrices ? ['Est. Damage Loss (₹)'] : [])],
          rows: list.map((p) => [
            p.name,
            p.sku,
            `${p.damagedQty} ${p.unit}`,
            p.availableQty,
            p.warehouseZone || '-',
            ...(caps.canViewPurchasePrices ? [(p.damagedQty * p.purchasePrice).toFixed(2)] : []),
          ]),
        };
      }

      case 'returns_report': {
        const list = returns.filter(
          (r) =>
            isDateInRange(r.returnDate, dateFrom, dateTo) &&
            (productFilter === 'all' || r.productId === productFilter)
        );
        return {
          title: 'Returns Report',
          headers: ['Date', 'Return No', 'Type', 'Party', 'Product', 'Qty', 'Value (₹)', 'Condition'],
          rows: list.map((r) => [
            formatDateDDMMYYYY(r.returnDate),
            r.returnNumber,
            r.returnType,
            r.partyName || 'Internal',
            r.productName,
            r.qty,
            r.totalValue.toFixed(2),
            r.condition,
          ]),
        };
      }

      case 'user_activity': {
        const list = auditLogs
          .filter((a) => userFilter === 'all' || a.userName === userFilter)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return {
          title: 'User Activity & Audit Report',
          headers: ['Timestamp (IST)', 'User', 'Role', 'Module', 'Action', 'Details'],
          rows: list.map((a) => [
            formatTimestampIST(a.createdAt),
            a.userName,
            a.userRole,
            a.module,
            a.action,
            a.details,
          ]),
        };
      }

      case 'location_analytics': {
        const map = new Map<
          string,
          { shopsCount: number; deliveries: number; sales: number; outstanding: number }
        >();
        for (const sh of shops) {
          const key = (sh[groupByLoc] || 'Unspecified').trim();
          const c = map.get(key) || { shopsCount: 0, deliveries: 0, sales: 0, outstanding: 0 };
          c.shopsCount += 1;
          c.outstanding += sh.currentOutstanding;
          map.set(key, c);
        }
        for (const s of filteredSales) {
          const sh = shopById.get(s.shopId);
          const key = (sh?.[groupByLoc] || s.shopBlock || 'Unspecified').trim();
          const c = map.get(key) || { shopsCount: 0, deliveries: 0, sales: 0, outstanding: 0 };
          c.deliveries += 1;
          c.sales += s.netTotal;
          map.set(key, c);
        }
        return {
          title: `Location-Based Report (Grouped by ${groupByLoc})`,
          headers: ['Area / Route', 'Active Shops', 'Deliveries (Period)', 'Sales (₹)', 'Current Outstanding (₹)'],
          rows: Array.from(map.entries())
            .sort((a, b) => b[1].sales - a[1].sales)
            .map(([k, v]) => [
              k,
              v.shopsCount,
              v.deliveries,
              v.sales.toFixed(2),
              v.outstanding.toFixed(2),
            ]),
        };
      }
    }
  }, [
    reportId,
    dateFrom,
    dateTo,
    shopFilter,
    supplierFilter,
    productFilter,
    blockFilter,
    userFilter,
    groupByLoc,
    caps,
    products,
    suppliers,
    shops,
    purchases,
    sales,
    saleItems,
    stockMovements,
    payments,
    returns,
    auditLogs,
  ]);

  return (
    <div className="space-y-4">
      {/* Report Selector & Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={reportId}
            onChange={(e) => setReportId(e.target.value as ReportId)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
          >
            {visibleReports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportTableToPDF(
                `${reportId}.pdf`,
                reportData.title,
                `Period: ${formatDateDDMMYYYY(dateFrom)} to ${formatDateDDMMYYYY(dateTo)}`,
                reportData.headers,
                reportData.rows,
                settings
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportRowsToXLSX(`${reportId}.xlsx`, reportId, reportData.headers, reportData.rows)
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>XLSX</span>
          </button>
          <button
            type="button"
            onClick={() => exportRowsToCSV(`${reportId}.csv`, reportData.headers, reportData.rows)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Dimension Filters */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs">
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5"
        >
          <option value="all">All Products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {caps.canViewCustomerLedgers && (
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5"
          >
            <option value="all">All Shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shopName}
              </option>
            ))}
          </select>
        )}

        {caps.canViewSupplierFinancials && (
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={blockFilter}
          onChange={(e) => setBlockFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5"
        >
          <option value="all">All Paschim Medinipur Blocks</option>
          {blocks.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5"
        >
          <option value="all">All Users</option>
          {staffNames.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        {reportId === 'location_analytics' && (
          <select
            value={groupByLoc}
            onChange={(e) => setGroupByLoc(e.target.value as typeof groupByLoc)}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 font-medium text-blue-700"
          >
            <option value="blockArea">Group by Block / Area</option>
            <option value="villageTown">Group by Village / Town</option>
            <option value="district">Group by District</option>
            <option value="route">Group by Delivery Route</option>
          </select>
        )}
      </div>

      {/* Report Output Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{reportData.title}</h3>
          <p className="text-[11px] text-slate-500">
            {reportData.rows.length} rows · {formatDateDDMMYYYY(dateFrom)} to{' '}
            {formatDateDDMMYYYY(dateTo)}
          </p>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              {reportData.headers.map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reportData.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={reportData.headers.length}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No records match these report filters.
                </td>
              </tr>
            ) : (
              reportData.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 font-mono text-slate-800 tabular-nums">
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
