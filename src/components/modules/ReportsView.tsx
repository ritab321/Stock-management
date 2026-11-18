import React, { useMemo, useState } from 'react';
import { Download, MapPin } from 'lucide-react';
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
  | 'product_sales'
  | 'shop_sales'
  | 'current_stock'
  | 'stock_movement'
  | 'warehouse_stock'
  | 'direct_delivery'
  | 'purchase_report'
  | 'customer_outstanding'
  | 'supplier_outstanding'
  | 'payment_collection'
  | 'gross_profit'
  | 'returns_report'
  | 'damaged_stock'
  | 'employee_activity'
  | 'area_sales'
  | 'monthly_business_summary';

const REPORT_LIST: Array<{ id: ReportId; label: string; requiresProfit?: boolean }> = [
  { id: 'daily_sales', label: '1. Daily Sales Report' },
  { id: 'monthly_sales', label: '2. Monthly Sales Report' },
  { id: 'product_sales', label: '3. Product-wise Sales Report' },
  { id: 'shop_sales', label: '4. Shop-wise Sales Report' },
  { id: 'current_stock', label: '5. Current Stock Report' },
  { id: 'stock_movement', label: '6. Stock Movement Report' },
  { id: 'warehouse_stock', label: '7. Warehouse Stock Report' },
  { id: 'direct_delivery', label: '8. Direct Delivery Report' },
  { id: 'purchase_report', label: '9. Purchase Report' },
  { id: 'customer_outstanding', label: '10. Customer Outstanding Report' },
  { id: 'supplier_outstanding', label: '11. Supplier Outstanding Report' },
  { id: 'payment_collection', label: '12. Payment Collection Report' },
  { id: 'gross_profit', label: '13. Gross Profit Report', requiresProfit: true },
  { id: 'returns_report', label: '14. Returns Report' },
  { id: 'damaged_stock', label: '15. Damaged Stock Report' },
  { id: 'employee_activity', label: '16. Employee Activity Report' },
  { id: 'area_sales', label: '17. Area-wise Sales Report (Paschim Medinipur)' },
  { id: 'monthly_business_summary', label: '18. Monthly Business Summary', requiresProfit: true },
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
    invoices,
    invoiceItems,
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
  const [groupByLoc, setGroupByLoc] = useState<'blockArea' | 'town' | 'villageTown' | 'district' | 'route'>(
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

    // Combined sales + confirmed Bill Book invoices filtered by date/shop/area/user
    const filteredSales = sales.filter((s) => {
      if (s.deliveryStatus === 'reversed') return false;
      if (!isDateInRange(s.saleDate, dateFrom, dateTo)) return false;
      if (shopFilter !== 'all' && s.shopId !== shopFilter) return false;
      if (supplierFilter !== 'all' && s.supplierId !== supplierFilter) return false;
      if (blockFilter !== 'all' && s.shopBlock !== blockFilter) return false;
      if (userFilter !== 'all' && s.createdByName !== userFilter) return false;
      return true;
    });

    const filteredBills =
      supplierFilter !== 'all'
        ? []
        : invoices.filter((inv) => {
            if (inv.status !== 'confirmed') return false;
            if (!isDateInRange(inv.invoiceDate, dateFrom, dateTo)) return false;
            if (shopFilter !== 'all' && inv.shopId !== shopFilter) return false;
            if (blockFilter !== 'all' && inv.shopBlock !== blockFilter) return false;
            if (userFilter !== 'all' && inv.createdByName !== userFilter) return false;
            return true;
          });

    // Bill book items profit helper
    const billMetricsByInv = new Map<string, { cost: number; profit: number }>();
    const billIdSet = new Set(filteredBills.map((b) => b.id));
    for (const ii of invoiceItems) {
      if (!billIdSet.has(ii.invoiceId)) continue;
      const cur = billMetricsByInv.get(ii.invoiceId) || { cost: 0, profit: 0 };
      const lineCost = ii.qty * ii.unitCost;
      cur.cost += lineCost;
      cur.profit += ii.amount - lineCost;
      billMetricsByInv.set(ii.invoiceId, cur);
    }

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
        for (const inv of filteredBills) {
          const c = map.get(inv.invoiceDate) || { count: 0, net: 0, paid: 0, due: 0, profit: 0 };
          const bm = billMetricsByInv.get(inv.id);
          c.count += 1;
          c.net += inv.netTotal;
          c.paid += inv.paymentReceived;
          c.due += inv.remainingDue;
          c.profit += bm ? bm.profit : 0;
          map.set(inv.invoiceDate, c);
        }
        const headers = [
          'Date',
          'Invoices / Bills',
          'Net Sales (₹)',
          'Collected (₹)',
          'Due (₹)',
          ...(caps.canViewProfitMetrics ? ['Gross Profit (₹)'] : []),
        ];
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
        return { title: 'Daily Sales Report (Dispatches + Bill Book)', headers, rows };
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
        for (const inv of filteredBills) {
          const mo = inv.invoiceDate.slice(0, 7);
          const bm = billMetricsByInv.get(inv.id);
          const c = map.get(mo) || { count: 0, net: 0, paid: 0, profit: 0 };
          c.count += 1;
          c.net += inv.netTotal;
          c.paid += inv.paymentReceived;
          c.profit += bm ? bm.profit : 0;
          map.set(mo, c);
        }
        const headers = [
          'Month',
          'Invoices / Bills',
          'Net Sales (₹)',
          'Collected (₹)',
          ...(caps.canViewProfitMetrics ? ['Gross Profit (₹)'] : []),
        ];
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
        for (const ii of invoiceItems) {
          if (!billIdSet.has(ii.invoiceId)) continue;
          if (productFilter !== 'all' && ii.productId !== productFilter) continue;
          const c = map.get(ii.productId) || {
            name: ii.productName,
            sku: ii.sku,
            qty: 0,
            rev: 0,
            profit: 0,
          };
          c.qty += ii.qty;
          c.rev += ii.amount;
          c.profit += ii.amount - ii.qty * ii.unitCost;
          map.set(ii.productId, c);
        }
        return {
          title: 'Product-wise Sales Report',
          headers: [
            'Product',
            'SKU',
            'Qty Sold',
            'Sales Revenue (₹)',
            ...(caps.canViewProfitMetrics ? ['Profit (₹)'] : []),
          ],
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
        for (const inv of filteredBills) {
          const c = map.get(inv.shopId) || {
            name: inv.shopName,
            area: inv.shopBlock || '-',
            count: 0,
            net: 0,
            due: 0,
          };
          c.count += 1;
          c.net += inv.netTotal;
          c.due += inv.remainingDue;
          map.set(inv.shopId, c);
        }
        return {
          title: 'Shop-wise Sales Report',
          headers: ['Shop Name', 'Block / Area', 'Bills & Invoices', 'Total Sales (₹)', 'Bill Due (₹)'],
          rows: Array.from(map.values())
            .sort((a, b) => b.net - a.net)
            .map((v) => [v.name, v.area, v.count, v.net.toFixed(2), v.due.toFixed(2)]),
        };
      }

      case 'current_stock': {
        const list = products
          .filter((p) => productFilter === 'all' || p.id === productFilter)
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          title: 'Current Stock Report',
          headers: [
            'Product',
            'SKU',
            'Category',
            'Available Qty',
            'Min Alert',
            'Wholesale Price (₹)',
            'Status',
          ],
          rows: list.map((p) => [
            p.name,
            p.sku,
            p.category,
            `${p.availableQty} ${p.unit}`,
            p.minStockAlert,
            p.sellingPrice.toFixed(2),
            p.availableQty <= 0
              ? 'OUT OF STOCK'
              : p.availableQty <= p.minStockAlert
              ? 'LOW STOCK'
              : 'HEALTHY',
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

      case 'warehouse_stock': {
        const list = products.filter((p) => productFilter === 'all' || p.id === productFilter);
        return {
          title: 'Warehouse Stock Valuation Report',
          headers: [
            'Product',
            'SKU',
            'Zone',
            'Sellable Qty',
            'Damaged Qty',
            'Min Alert',
            ...(caps.canViewPurchasePrices ? ['Stock Value (₹)'] : []),
          ],
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

      case 'direct_delivery': {
        const list = filteredSales.filter((s) => s.deliveryMethod === 'direct_supplier_dispatch');
        return {
          title: 'Direct Supplier Delivery Report',
          headers: [
            'Date',
            'Invoice',
            'Supplier',
            'Shop',
            'Sale Total (₹)',
            ...(caps.canViewProfitMetrics ? ['Cost (₹)', 'Gross Profit (₹)'] : []),
          ],
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

      case 'customer_outstanding': {
        const list = shops
          .filter(
            (s) =>
              (shopFilter === 'all' || s.id === shopFilter) &&
              (blockFilter === 'all' || s.blockArea === blockFilter)
          )
          .sort((a, b) => b.currentOutstanding - a.currentOutstanding);
        return {
          title: 'Customer Outstanding Report',
          headers: [
            'Shop Name',
            'Village / Block',
            'Mobile',
            'Credit Limit (₹)',
            'Outstanding (₹)',
            'Last Delivery',
          ],
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
          headers: [
            'Supplier',
            'Phone',
            'Total Purchases (₹)',
            'Payments Made (₹)',
            'Outstanding Payable (₹)',
          ],
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
        const rows: Array<Array<string | number>> = [
          ...filteredSales.map((s) => [
            formatDateDDMMYYYY(s.saleDate),
            s.invoiceNumber,
            s.shopName,
            s.deliveryMethod === 'warehouse_dispatch' ? 'Warehouse Dispatch' : 'Direct Delivery',
            s.netTotal.toFixed(2),
            s.totalCost.toFixed(2),
            s.grossProfit.toFixed(2),
          ]),
          ...filteredBills.map((inv) => {
            const bm = billMetricsByInv.get(inv.id) || { cost: 0, profit: inv.netTotal };
            return [
              formatDateDDMMYYYY(inv.invoiceDate),
              inv.invoiceNumber,
              inv.shopName,
              'Bill Book',
              inv.netTotal.toFixed(2),
              bm.cost.toFixed(2),
              bm.profit.toFixed(2),
            ];
          }),
        ];
        return {
          title: 'Gross Profit Report (Sales + Bill Book)',
          headers: ['Date', 'Invoice / Bill', 'Shop', 'Channel', 'Net Sales (₹)', 'COGS (₹)', 'Gross Profit (₹)'],
          rows,
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

      case 'damaged_stock': {
        const list = products.filter((p) => p.damagedQty > 0);
        return {
          title: 'Damaged Stock Report',
          headers: [
            'Product',
            'SKU',
            'Damaged Qty',
            'Sellable Qty',
            'Zone',
            ...(caps.canViewPurchasePrices ? ['Est. Damage Loss (₹)'] : []),
          ],
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

      case 'employee_activity': {
        const list = auditLogs
          .filter((a) => userFilter === 'all' || a.userName === userFilter)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        return {
          title: 'Employee Activity & Audit Report',
          headers: ['Timestamp (IST)', 'Employee', 'Role', 'Module', 'Action', 'Details'],
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

      case 'area_sales': {
        const map = new Map<
          string,
          { shopsCount: number; deliveries: number; sales: number; collected: number; outstanding: number }
        >();
        const getKey = (sh?: (typeof shops)[number], fallback?: string) => {
          if (!sh) return fallback || 'Unspecified';
          if (groupByLoc === 'town') return (sh.town || sh.villageTown || 'Unspecified').trim();
          return (sh[groupByLoc] || fallback || 'Unspecified').trim();
        };

        for (const sh of shops) {
          const key = getKey(sh);
          const c = map.get(key) || { shopsCount: 0, deliveries: 0, sales: 0, collected: 0, outstanding: 0 };
          c.shopsCount += 1;
          c.outstanding += sh.currentOutstanding;
          map.set(key, c);
        }
        for (const s of filteredSales) {
          const sh = shopById.get(s.shopId);
          const key = getKey(sh, s.shopBlock);
          const c = map.get(key) || { shopsCount: 0, deliveries: 0, sales: 0, collected: 0, outstanding: 0 };
          c.deliveries += 1;
          c.sales += s.netTotal;
          c.collected += s.paymentReceived;
          map.set(key, c);
        }
        for (const inv of filteredBills) {
          const sh = shopById.get(inv.shopId);
          const key = getKey(sh, inv.shopBlock);
          const c = map.get(key) || { shopsCount: 0, deliveries: 0, sales: 0, collected: 0, outstanding: 0 };
          c.deliveries += 1;
          c.sales += inv.netTotal;
          c.collected += inv.paymentReceived;
          map.set(key, c);
        }

        return {
          title: `Area-wise Sales Analytics (Grouped by ${groupByLoc})`,
          headers: [
            'Paschim Medinipur Area / Route',
            'Registered Shops',
            'Bills & Deliveries',
            'Sales Volume (₹)',
            'Collected (₹)',
            'Current Due (₹)',
          ],
          rows: Array.from(map.entries())
            .sort((a, b) => b[1].sales - a[1].sales)
            .map(([k, v]) => [
              k,
              v.shopsCount,
              v.deliveries,
              v.sales.toFixed(2),
              v.collected.toFixed(2),
              v.outstanding.toFixed(2),
            ]),
        };
      }

      case 'monthly_business_summary': {
        const map = new Map<
          string,
          { sales: number; purchases: number; collected: number; paidSup: number; profit: number; returns: number }
        >();
        const ensureMo = (mo: string) => {
          const cur = map.get(mo) || {
            sales: 0,
            purchases: 0,
            collected: 0,
            paidSup: 0,
            profit: 0,
            returns: 0,
          };
          map.set(mo, cur);
          return cur;
        };

        for (const s of filteredSales) {
          const c = ensureMo(s.saleDate.slice(0, 7));
          c.sales += s.netTotal;
          c.profit += s.grossProfit;
        }
        for (const inv of filteredBills) {
          const c = ensureMo(inv.invoiceDate.slice(0, 7));
          const bm = billMetricsByInv.get(inv.id);
          c.sales += inv.netTotal;
          c.profit += bm ? bm.profit : 0;
        }
        for (const p of purchases) {
          if (p.status === 'reversed' || !isDateInRange(p.purchaseDate, dateFrom, dateTo)) continue;
          ensureMo(p.purchaseDate.slice(0, 7)).purchases += p.totalCost;
        }
        for (const pay of payments) {
          if (pay.status !== 'active' || !isDateInRange(pay.paymentDate, dateFrom, dateTo)) continue;
          const c = ensureMo(pay.paymentDate.slice(0, 7));
          if (pay.partyType === 'shop') c.collected += pay.amount;
          else c.paidSup += pay.amount;
        }
        for (const ret of returns) {
          if (ret.status !== 'completed' || !isDateInRange(ret.returnDate, dateFrom, dateTo)) continue;
          ensureMo(ret.returnDate.slice(0, 7)).returns += ret.totalValue;
        }

        return {
          title: 'Monthly Business Summary Report',
          headers: [
            'Month',
            'Total Sales (₹)',
            'Purchases (₹)',
            'Collected (₹)',
            'Supplier Paid (₹)',
            'Returns (₹)',
            'Est. Gross Profit (₹)',
          ],
          rows: Array.from(map.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([mo, v]) => [
              mo,
              v.sales.toFixed(2),
              v.purchases.toFixed(2),
              v.collected.toFixed(2),
              v.paidSup.toFixed(2),
              v.returns.toFixed(2),
              v.profit.toFixed(2),
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
    invoices,
    invoiceItems,
    stockMovements,
    payments,
    returns,
    auditLogs,
  ]);

  // Quick Paschim Medinipur area breakdown summary for Area-wise report
  const topAreaCards = useMemo(() => {
    if (reportId !== 'area_sales') return [];
    return reportData.rows.slice(0, 4);
  }, [reportId, reportData.rows]);

  return (
    <div className="space-y-4">
      {/* Report Selector & Export Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={reportId}
            onChange={(e) => setReportId(e.target.value as ReportId)}
            className="rounded-lg border border-pink-200 bg-pink-50/40 px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-pink-600 focus:outline-none"
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
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span>PDF</span>
          </button>
          <button
            type="button"
            onClick={() =>
              exportRowsToXLSX(`${reportId}.xlsx`, reportId, reportData.headers, reportData.rows)
            }
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>XLSX</span>
          </button>
          <button
            type="button"
            onClick={() => exportRowsToCSV(`${reportId}.csv`, reportData.headers, reportData.rows)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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

        {reportId === 'area_sales' && (
          <select
            value={groupByLoc}
            onChange={(e) => setGroupByLoc(e.target.value as typeof groupByLoc)}
            className="rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1.5 font-medium text-pink-700"
          >
            <option value="blockArea">Group by Block / Area</option>
            <option value="town">Group by Town / Hub</option>
            <option value="villageTown">Group by Village / Market</option>
            <option value="district">Group by District</option>
            <option value="route">Group by Delivery Route</option>
          </select>
        )}
      </div>

      {/* Area Analytics Top Highlight Strip */}
      {topAreaCards.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topAreaCards.map((row) => (
            <div key={String(row[0])} className="rounded-xl border border-pink-100 bg-white p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-pink-700">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{String(row[0])}</span>
              </div>
              <div className="mt-1.5 font-mono text-lg font-bold text-slate-900 tabular-nums">
                {formatINR(Number(row[3]))}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                {row[1]} shops · {row[2]} orders · Due {formatINR(Number(row[5]))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Output Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{reportData.title}</h3>
            <p className="text-[11px] text-slate-500">
              {reportData.rows.length} rows · {formatDateDDMMYYYY(dateFrom)} to{' '}
              {formatDateDDMMYYYY(dateTo)}
            </p>
          </div>
          <span className="text-[11px] font-semibold text-pink-700">
            Pramanik Digital Point Analytics
          </span>
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
