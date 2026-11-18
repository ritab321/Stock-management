import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CreditCard,
  Database,
  IndianRupee,
  Package,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { seedDemoData } from '../../lib/demoSeed';
import {
  formatDateDDMMYYYY,
  formatINR,
  formatNumber,
  formatTimestampIST,
  getDateRangeForPreset,
  getTodayIST,
  isDateInRange,
  type DatePreset,
} from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { NavTab } from '../../types/erp';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
}

const CHART_COLORS = ['#1D4ED8', '#0D9488', '#4F46E5', '#D97706', '#059669', '#64748B'];

function getLast6Months(): Array<{ key: string; label: string }> {
  const today = getTodayIST();
  const [y, m] = today.split('-').map(Number);
  const res: Array<{ key: string; label: string }> = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1 - i, 1));
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const lbl = dt.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' });
    res.push({ key: `${yy}-${mm}`, label: `${lbl} '${String(yy).slice(2)}` });
  }
  return res;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const {
    profile,
    caps,
    lang,
    products,
    stockBatches,
    shops,
    suppliers,
    purchases,
    sales,
    saleItems,
    invoices,
    invoiceItems,
    payments,
    auditLogs,
    alerts,
    dataLoading,
  } = useErp();

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [customFrom, setCustomFrom] = useState(() => `${getTodayIST().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(() => getTodayIST());
  const [seeding, setSeeding] = useState(false);
  const [seedErr, setSeedErr] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const range = useMemo(
    () => getDateRangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const metrics = useMemo(() => {
    const activeProducts = products.filter((p) => p.status === 'active');
    const totalProducts = activeProducts.length;
    const totalWarehouseStock = activeProducts.reduce((sum, p) => sum + (p.availableQty || 0), 0);

    const batchedQtyByProd = new Map<string, number>();
    let batchValue = 0;
    for (const b of stockBatches) {
      if (b.remainingQty > 0) {
        batchedQtyByProd.set(b.productId, (batchedQtyByProd.get(b.productId) || 0) + b.remainingQty);
        batchValue += b.remainingQty * b.unitCost;
      }
    }
    let unbatchedValue = 0;
    for (const p of activeProducts) {
      const bQty = batchedQtyByProd.get(p.id) || 0;
      const diff = Math.max(0, (p.availableQty || 0) - bQty);
      unbatchedValue += diff * (p.purchasePrice || 0);
    }
    const totalStockValue = batchValue + unbatchedValue;

    const totalShops = shops.filter((s) => s.status === 'active').length;
    const today = getTodayIST();

    const confirmedBills = invoices.filter((inv) => inv.status === 'confirmed');
    const validSales = sales.filter((s) => s.deliveryStatus !== 'reversed');
    const validPurchases = purchases.filter((p) => p.status !== 'reversed');

    // Today's sales (Deliveries + Confirmed Bill Book)
    const todaySalesTotal =
      validSales.filter((s) => s.saleDate === today).reduce((sum, s) => sum + (s.netTotal || 0), 0) +
      confirmedBills
        .filter((b) => b.invoiceDate === today)
        .reduce((sum, b) => sum + (b.netTotal || 0), 0);

    const todayDeliveries =
      validSales.filter((s) => s.saleDate === today).length +
      confirmedBills.filter((b) => b.invoiceDate === today).length;

    const periodSales = validSales.filter((s) => isDateInRange(s.saleDate, range.from, range.to));
    const periodBills = confirmedBills.filter((b) => isDateInRange(b.invoiceDate, range.from, range.to));

    const periodSalesTotal =
      periodSales.reduce((sum, s) => sum + (s.netTotal || 0), 0) +
      periodBills.reduce((sum, b) => sum + (b.netTotal || 0), 0);

    // Bill Book profit from item unitCost
    const billCostByInv = new Map<string, number>();
    for (const bi of invoiceItems) {
      billCostByInv.set(bi.invoiceId, (billCostByInv.get(bi.invoiceId) || 0) + bi.qty * (bi.unitCost || 0));
    }
    const periodBillsProfit = periodBills.reduce((sum, b) => {
      const cogs = billCostByInv.get(b.id) || 0;
      return sum + (b.subtotal - b.discount - cogs);
    }, 0);

    const periodGrossProfit =
      periodSales.reduce((sum, s) => sum + (s.grossProfit || 0), 0) + periodBillsProfit;

    const periodPurchasesTotal = validPurchases
      .filter((p) => isDateInRange(p.purchaseDate, range.from, range.to))
      .reduce((sum, p) => sum + (p.totalCost || 0), 0);

    const periodPayments = payments.filter(
      (p) =>
        p.partyType === 'shop' &&
        p.status === 'active' &&
        p.paymentKind !== 'refund' &&
        p.paymentKind !== 'credit_note' &&
        isDateInRange(p.paymentDate, range.from, range.to)
    );
    const periodPaymentsCollected = periodPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const shopOutstanding = shops.reduce((sum, s) => sum + Math.max(0, s.currentOutstanding || 0), 0);
    const supplierOutstanding = suppliers.reduce((sum, s) => sum + Math.max(0, s.outstandingPayable || 0), 0);

    // Top Selling Products (Sales + Confirmed Bills)
    const periodSaleIds = new Set(periodSales.map((s) => s.id));
    const periodBillIds = new Set(periodBills.map((b) => b.id));
    const prodAgg = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
    for (const it of saleItems) {
      if (!periodSaleIds.has(it.saleId)) continue;
      const cur = prodAgg.get(it.productId) || { name: it.productName, sku: it.sku, qty: 0, revenue: 0 };
      cur.qty += it.orderedQty;
      cur.revenue += it.lineTotal;
      prodAgg.set(it.productId, cur);
    }
    for (const bi of invoiceItems) {
      if (!periodBillIds.has(bi.invoiceId)) continue;
      const cur = prodAgg.get(bi.productId) || { name: bi.productName, sku: bi.sku, qty: 0, revenue: 0 };
      cur.qty += bi.qty;
      cur.revenue += bi.amount;
      prodAgg.set(bi.productId, cur);
    }
    const topProducts = Array.from(prodAgg.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

    // Top Purchasing Shops (Sales + Confirmed Bills)
    const shopAgg = new Map<string, { id: string; name: string; block: string; orders: number; total: number }>();
    for (const s of periodSales) {
      const cur = shopAgg.get(s.shopId) || {
        id: s.shopId,
        name: s.shopName,
        block: s.shopBlock || '-',
        orders: 0,
        total: 0,
      };
      cur.orders += 1;
      cur.total += s.netTotal;
      shopAgg.set(s.shopId, cur);
    }
    for (const b of periodBills) {
      const cur = shopAgg.get(b.shopId) || {
        id: b.shopId,
        name: b.shopName,
        block: b.shopBlock || '-',
        orders: 0,
        total: 0,
      };
      cur.orders += 1;
      cur.total += b.netTotal;
      shopAgg.set(b.shopId, cur);
    }
    const topShops = Array.from(shopAgg.values()).sort((a, b) => b.total - a.total).slice(0, 6);

    const lowStockList = activeProducts
      .filter((p) => p.availableQty <= p.minStockAlert)
      .sort((a, b) => a.availableQty - b.availableQty)
      .slice(0, 8);

    // 6-Month Series for Charts
    const months = getLast6Months();
    const monthlySeries = months.map((m) => {
      const mSales = validSales.filter((s) => s.saleDate.startsWith(m.key));
      const mBills = confirmedBills.filter((b) => b.invoiceDate.startsWith(m.key));
      const mPur = validPurchases.filter((p) => p.purchaseDate.startsWith(m.key));
      const salesAmt =
        mSales.reduce((acc, s) => acc + s.netTotal, 0) +
        mBills.reduce((acc, b) => acc + b.netTotal, 0);
      const purchaseAmt = mPur.reduce((acc, p) => acc + p.totalCost, 0);
      const billProf = mBills.reduce((acc, b) => acc + (b.subtotal - b.discount - (billCostByInv.get(b.id) || 0)), 0);
      const profitAmt = mSales.reduce((acc, s) => acc + s.grossProfit, 0) + billProf;
      return { ...m, salesAmt, purchaseAmt, profitAmt };
    });

    // Payment Collection by Method
    const payMethods: Array<{ key: string; label: string; color: string; amount: number }> = [
      { key: 'cash', label: 'Cash', color: '#059669', amount: 0 },
      { key: 'upi', label: 'UPI / QR', color: '#2563EB', amount: 0 },
      { key: 'bank_transfer', label: 'Bank Transfer', color: '#4F46E5', amount: 0 },
      { key: 'other', label: 'Other', color: '#0891B2', amount: 0 },
    ];
    for (const p of periodPayments) {
      const bucket = payMethods.find((m) => m.key === p.method) || payMethods[3];
      bucket.amount += p.amount;
    }

    // Category Stock Distribution
    const catMap = new Map<string, number>();
    for (const p of activeProducts) {
      const c = p.category || 'Other';
      catMap.set(c, (catMap.get(c) || 0) + Math.max(0, p.availableQty));
    }
    const stockDist = Array.from(catMap.entries())
      .map(([category, qty], idx) => ({
        category,
        qty,
        color: CHART_COLORS[idx % CHART_COLORS.length],
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);

    // Recent Combined Transactions
    const recentTx: Array<{ id: string; date: string; type: string; party: string; ref: string; amount: number; tab: NavTab }> = [];
    validSales.forEach((s) =>
      recentTx.push({ id: `s_${s.id}`, date: s.saleDate, type: 'Sale Dispatch', party: s.shopName, ref: s.invoiceNumber, amount: s.netTotal, tab: 'sales' })
    );
    invoices
      .filter((b) => b.status !== 'cancelled')
      .forEach((b) =>
        recentTx.push({ id: `b_${b.id}`, date: b.invoiceDate, type: b.status === 'draft' ? 'Bill Draft' : 'Bill Book', party: b.shopName, ref: b.invoiceNumber, amount: b.netTotal, tab: 'billbook' })
      );
    if (caps.canManagePurchases || caps.canViewPurchasePrices) {
      validPurchases.forEach((p) =>
        recentTx.push({ id: `p_${p.id}`, date: p.purchaseDate, type: 'Purchase', party: p.supplierName, ref: p.invoiceNumber, amount: p.totalCost, tab: 'purchases' })
      );
    }
    payments
      .filter((p) => p.status === 'active')
      .forEach((p) =>
        recentTx.push({ id: `pay_${p.id}`, date: p.paymentDate, type: p.partyType === 'shop' ? 'Collection' : 'Supplier Pay', party: p.partyName, ref: p.receiptNumber, amount: p.amount, tab: 'payments' })
      );
    recentTx.sort((a, b) => b.date.localeCompare(a.date));

    return {
      totalProducts,
      totalWarehouseStock,
      totalStockValue,
      totalShops,
      todayDeliveries,
      todaySalesTotal,
      periodDeliveries: periodSales.length + periodBills.length,
      periodSalesTotal,
      periodPurchasesTotal,
      periodGrossProfit,
      periodPaymentsCollected,
      shopOutstanding,
      supplierOutstanding,
      topProducts,
      topShops,
      lowStockList,
      monthlySeries,
      payMethods,
      stockDist,
      recentTx: recentTx.slice(0, 8),
    };
  }, [
    products,
    stockBatches,
    shops,
    suppliers,
    purchases,
    sales,
    saleItems,
    invoices,
    invoiceItems,
    payments,
    range,
    caps.canManagePurchases,
    caps.canViewPurchasePrices,
  ]);

  const handleLoadDemo = async () => {
    if (!profile) return;
    setSeeding(true);
    setSeedErr(null);
    try {
      await seedDemoData({
        uid: profile.uid,
        displayName: profile.displayName,
        role: profile.role,
      });
    } catch (err) {
      setSeedErr(err instanceof Error ? err.message : 'Failed to seed demo data.');
    } finally {
      setSeeding(false);
    }
  };

  const isEmpty = !dataLoading && products.length === 0 && shops.length === 0 && suppliers.length === 0;
  const maxSalesPur = Math.max(
    1,
    ...metrics.monthlySeries.map((m) => Math.max(m.salesAmt, m.purchaseAmt))
  );
  const maxProfit = Math.max(1, ...metrics.monthlySeries.map((m) => Math.max(0, m.profitAmt)));
  const totalPayCollectedChart = Math.max(
    1,
    metrics.payMethods.reduce((s, p) => s + p.amount, 0)
  );
  const totalStockUnitsDist = Math.max(
    1,
    metrics.stockDist.reduce((s, d) => s + d.qty, 0)
  );

  return (
    <div className="space-y-6">
      {/* Executive Date Filter Bar */}
      <div className="erp-card flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100/90 p-1">
          {(
            [
              ['today', t(lang, 'date_today')],
              ['yesterday', t(lang, 'date_yesterday')],
              ['this_week', t(lang, 'date_this_week')],
              ['this_month', t(lang, 'date_this_month')],
              ['this_year', t(lang, 'date_this_year')],
              ['custom', t(lang, 'date_custom')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                preset === key
                  ? 'bg-[#0B1221] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0B1221]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {preset === 'custom' ? (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              />
              <span>to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              />
            </>
          ) : (
            <span className="font-mono tabular-nums text-slate-500">
              {formatDateDDMMYYYY(range.from)} — {formatDateDDMMYYYY(range.to)}
            </span>
          )}
        </div>
      </div>

      {/* Empty Workspace Onboarding for Owner */}
      {isEmpty && caps.canManageDemoData && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200/80 bg-blue-50/70 px-5 py-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-[#2563EB]" />
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B1221]">
                Initialize Pramanik Stock Manager Workspace
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Your Firestore database is connected and empty. Load clearly marked DEMO records (Paschim Medinipur shops, suppliers, warehouse, Bill Book & direct dispatches) to test all calculations, or start adding real entries.
              </p>
              {seedErr && <p className="mt-1 text-xs text-[#DC2626]">{seedErr}</p>}
            </div>
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={handleLoadDemo}
            className="whitespace-nowrap shrink-0 rounded-lg bg-[#0B1221] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#172554] disabled:opacity-50"
          >
            {seeding ? 'Loading Demo Data...' : t(lang, 'load_demo')}
          </button>
        </div>
      )}

      {/* Tier 1: Executive Financial Anchor Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Anchor 1: Period & Today's Sales (Dominant Obsidian Navy Focal Anchor) */}
        {caps.canViewCustomerLedgers ? (
          <button
            type="button"
            onClick={() => onNavigate('billbook')}
            className="relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-[#0B1221] via-[#111E38] to-[#172A50] p-5 text-left text-white shadow-sm transition-all hover:border-blue-500/50"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-500/15 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>{t(lang, 'kpi_monthly_sales')}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sky-300">
                  <TrendingUp className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white tabular-nums">
                {formatINR(metrics.periodSalesTotal)}
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-300">
                <span>Today: {formatINR(metrics.todaySalesTotal)}</span>
                <span className="font-mono tabular-nums text-sky-300">
                  {metrics.periodDeliveries} bills
                </span>
              </div>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('warehouse')}
            className="relative overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-[#0B1221] via-[#111E38] to-[#172A50] p-5 text-left text-white shadow-sm transition-all hover:border-teal-500/50"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span>{t(lang, 'kpi_warehouse_stock')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-teal-300">
                <Warehouse className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-white tabular-nums">
              {formatNumber(metrics.totalWarehouseStock)}
            </p>
            <p className="mt-3 border-t border-white/10 pt-2.5 text-[11px] text-slate-300">
              Units in central warehouse
            </p>
          </button>
        )}

        {/* Anchor 2: Gross Profit (Emerald Tonal Accent) */}
        {caps.canViewProfitMetrics && (
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="erp-card rounded-xl p-5 text-left transition-all hover:border-emerald-300"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_gross_profit')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#0B1221] tabular-nums">
              {formatINR(metrics.periodGrossProfit)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              <span>Net Sales minus COGS</span>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                {metrics.periodSalesTotal > 0
                  ? `${((metrics.periodGrossProfit / metrics.periodSalesTotal) * 100).toFixed(1)}% margin`
                  : '0.0%'}
              </span>
            </div>
          </button>
        )}

        {/* Anchor 3: Customer Receivable (Amber Copper Tonal Accent) */}
        {caps.canViewCustomerLedgers && (
          <button
            type="button"
            onClick={() => onNavigate('outstanding')}
            className="erp-card rounded-xl p-5 text-left transition-all hover:border-amber-300"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_shop_outstanding')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#0B1221] tabular-nums">
              {formatINR(metrics.shopOutstanding)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              <span>Total receivable from shops</span>
              <span className="font-semibold text-amber-700">View Dues</span>
            </div>
          </button>
        )}

        {/* Anchor 4: Stock Valuation or Active Products (Teal Tonal Accent) */}
        {caps.canViewPurchasePrices ? (
          <button
            type="button"
            onClick={() => onNavigate('warehouse')}
            className="erp-card rounded-xl p-5 text-left transition-all hover:border-teal-300"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_stock_value')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <IndianRupee className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#0B1221] tabular-nums">
              {formatINR(metrics.totalStockValue)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              <span>{formatNumber(metrics.totalWarehouseStock)} warehouse units</span>
              <span className="font-mono font-semibold text-teal-700 tabular-nums">
                {metrics.totalProducts} SKUs
              </span>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="erp-card rounded-xl p-5 text-left transition-all hover:border-teal-300"
          >
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_total_products')}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                <Package className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-[#0B1221] tabular-nums">
              {formatNumber(metrics.totalProducts)}
            </p>
            <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              Active SKUs in catalog
            </div>
          </button>
        )}
      </div>

      {/* Tier 2: Precision Operational Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {caps.canViewCustomerLedgers && (
          <button
            type="button"
            onClick={() => onNavigate('sales')}
            className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-blue-300"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_today_sales')}</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
                {formatINR(metrics.todaySalesTotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {metrics.todayDeliveries} bills & dispatches today
              </div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Truck className="h-4 w-4" />
            </span>
          </button>
        )}

        {caps.canRecordShopPayments && (
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-emerald-300"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_payments_collected')}</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
                {formatINR(metrics.periodPaymentsCollected)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Shop receipts in period</div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CreditCard className="h-4 w-4" />
            </span>
          </button>
        )}

        {caps.canViewPurchasePrices && (
          <button
            type="button"
            onClick={() => onNavigate('purchases')}
            className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-indigo-300"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_total_purchases')}</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
                {formatINR(metrics.periodPurchasesTotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Warehouse & direct inward</div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ShoppingBag className="h-4 w-4" />
            </span>
          </button>
        )}

        {caps.canViewSupplierFinancials && (
          <button
            type="button"
            onClick={() => onNavigate('suppliers')}
            className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-red-300"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_supplier_outstanding')}</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
                {formatINR(metrics.supplierOutstanding)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Total payable to suppliers</div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Building2 className="h-4 w-4" />
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate('products')}
          className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-teal-300"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_total_products')}</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
              {formatNumber(metrics.totalProducts)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">Active SKUs in catalog</div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Package className="h-4 w-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('warehouse')}
          className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-slate-300"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_warehouse_stock')}</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
              {formatNumber(metrics.totalWarehouseStock)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">Units in central warehouse</div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Warehouse className="h-4 w-4" />
          </span>
        </button>

        {caps.canViewCustomerLedgers && (
          <button
            type="button"
            onClick={() => onNavigate('shops')}
            className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-cyan-300"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_total_shops')}</div>
              <div className="mt-1 font-mono text-lg font-bold text-[#0B1221] tabular-nums">
                {formatNumber(metrics.totalShops)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Paschim Medinipur retailers</div>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
              <Store className="h-4 w-4" />
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate('warehouse')}
          className="erp-card flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:border-rose-300"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-500">{t(lang, 'kpi_low_stock')}</div>
            <div
              className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                metrics.lowStockList.length > 0 ? 'text-[#DC2626]' : 'text-[#0B1221]'
              }`}
            >
              {formatNumber(metrics.lowStockList.length)}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {metrics.lowStockList.length > 0 ? 'Need restock attention' : 'All stock nominal'}
            </div>
          </div>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              metrics.lowStockList.length > 0
                ? 'bg-rose-50 text-rose-600'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
        </button>
      </div>

      {/* Business Analytics Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 1: Monthly Sales vs Purchase Comparison with Gradient Bars & Obsidian Hover Tooltip */}
        {caps.canViewCustomerLedgers && (
          <div className="erp-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0B1221]">
                  Monthly Sales vs Purchases (6 Months)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Sales vs Purchases · Hover bars for exact INR values
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#2563EB]" /> Sales
                </span>
                {caps.canViewPurchasePrices && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#6366F1]" /> Purchase
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5">
              <svg viewBox="0 0 540 195" className="h-48 w-full overflow-visible">
                <defs>
                  <linearGradient id="erpSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1D4ED8" />
                    <stop offset="100%" stopColor="#60A5FA" />
                  </linearGradient>
                  <linearGradient id="erpPurGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" />
                    <stop offset="100%" stopColor="#A5B4FC" />
                  </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = 155 - step * 130;
                  return (
                    <line key={step} x1="0" x2="540" y1={y} y2={y} stroke="#EEF2F7" strokeWidth="1" />
                  );
                })}
                {metrics.monthlySeries.map((m, idx) => {
                  const groupX = 28 + idx * 86;
                  const sH = Math.max(3, (m.salesAmt / maxSalesPur) * 126);
                  const pH = Math.max(3, (m.purchaseAmt / maxSalesPur) * 126);
                  const topY = Math.min(155 - sH, 155 - pH);
                  return (
                    <g
                      key={m.key}
                      onMouseEnter={() => setHoveredMonth(m.key)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={groupX}
                        y={155 - sH}
                        width="22"
                        height={sH}
                        rx="4"
                        fill="url(#erpSalesGrad)"
                        opacity={hoveredMonth && hoveredMonth !== m.key ? 0.55 : 1}
                      />
                      {caps.canViewPurchasePrices && (
                        <rect
                          x={groupX + 26}
                          y={155 - pH}
                          width="22"
                          height={pH}
                          rx="4"
                          fill="url(#erpPurGrad)"
                          opacity={hoveredMonth && hoveredMonth !== m.key ? 0.55 : 1}
                        />
                      )}
                      <text
                        x={groupX + (caps.canViewPurchasePrices ? 24 : 11)}
                        y="176"
                        textAnchor="middle"
                        className="fill-slate-500 text-[11px]"
                      >
                        {m.label}
                      </text>
                      {hoveredMonth === m.key && (
                        <g>
                          <rect
                            x={Math.max(4, Math.min(436, groupX - 24))}
                            y={Math.max(2, topY - 26)}
                            width="98"
                            height="20"
                            rx="5"
                            fill="#0B1221"
                          />
                          <text
                            x={Math.max(53, Math.min(485, groupX + 25))}
                            y={Math.max(15, topY - 13)}
                            textAnchor="middle"
                            className="fill-white font-mono text-[10px] font-semibold"
                          >
                            {formatINR(m.salesAmt)}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        {/* Chart 2: Monthly Gross Profit Area Trend */}
        {caps.canViewProfitMetrics && (
          <div className="erp-card rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0B1221]">
                  Monthly Gross Profit Trend
                </h3>
                <p className="text-[11px] text-slate-500">
                  Net wholesale margin across warehouse & direct deliveries
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-700 tabular-nums">
                Period: {formatINR(metrics.periodGrossProfit)}
              </span>
            </div>

            <div className="mt-5">
              <svg viewBox="0 0 540 195" className="h-48 w-full overflow-visible">
                <defs>
                  <linearGradient id="erpProfitArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = 155 - step * 130;
                  return (
                    <line key={step} x1="0" x2="540" y1={y} y2={y} stroke="#EEF2F7" strokeWidth="1" />
                  );
                })}
                {(() => {
                  const pts = metrics.monthlySeries.map((m, idx) => {
                    const x = 48 + idx * 88;
                    const y = 155 - Math.max(0, (m.profitAmt / maxProfit) * 124);
                    return { ...m, x, y };
                  });
                  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                  const areaD = `${pathD} L ${pts[pts.length - 1].x} 155 L ${pts[0].x} 155 Z`;
                  return (
                    <>
                      <path d={areaD} fill="url(#erpProfitArea)" />
                      <path d={pathD} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      {pts.map((p) => (
                        <g key={p.key}>
                          <circle cx={p.x} cy={p.y} r="4.5" fill="#059669" stroke="#ffffff" strokeWidth="2" />
                          <text x={p.x} y={p.y - 10} textAnchor="middle" className="fill-slate-700 font-mono text-[10px] font-semibold">
                            {p.profitAmt > 0 ? `₹${Math.round(p.profitAmt).toLocaleString('en-IN')}` : '₹0'}
                          </text>
                          <text x={p.x} y="176" textAnchor="middle" className="fill-slate-500 text-[11px]">
                            {p.label}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>
        )}

        {/* Chart 3: Payment Collection by Method + Receivables vs Payables */}
        {caps.canRecordShopPayments && (
          <div className="erp-card rounded-xl p-5">
            <h3 className="font-display text-sm font-bold text-[#0B1221]">
              Payment Collection & Balance Position
            </h3>
            <p className="text-[11px] text-slate-500">
              Period collections by payment mode and open party balances
            </p>

            <div className="mt-4 space-y-3">
              {metrics.payMethods.map((pm) => {
                const pct = Math.round((pm.amount / totalPayCollectedChart) * 100);
                return (
                  <div key={pm.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{pm.label}</span>
                      <span className="font-mono font-semibold text-[#0B1221] tabular-nums">
                        {formatINR(pm.amount)} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-sm bg-slate-100">
                      <div
                        className="h-full rounded-sm transition-all"
                        style={{ width: `${Math.max(pm.amount > 0 ? 4 : 0, pct)}%`, backgroundColor: pm.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {caps.canViewSupplierFinancials && (
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
                <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-3">
                  <div className="text-[11px] font-medium text-amber-800">Customer Receivable</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[#0B1221] tabular-nums">
                    {formatINR(metrics.shopOutstanding)}
                  </div>
                </div>
                <div className="rounded-lg border border-red-200/70 bg-red-50/50 p-3">
                  <div className="text-[11px] font-medium text-red-700">Supplier Payable</div>
                  <div className="mt-1 font-mono text-sm font-bold text-[#0B1221] tabular-nums">
                    {formatINR(metrics.supplierOutstanding)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chart 4: Stock Distribution by Category */}
        <div className="erp-card rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B1221]">
                Warehouse Stock Distribution
              </h3>
              <p className="text-[11px] text-slate-500">Available inventory units across top categories</p>
            </div>
            <span className="font-mono text-xs font-bold text-teal-700 tabular-nums">
              {formatNumber(metrics.totalWarehouseStock)} units
            </span>
          </div>

          {metrics.stockDist.length === 0 ? (
            <p className="py-12 text-center text-xs text-slate-500">No warehouse stock data available yet.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0">
                {(() => {
                  const r = 50;
                  const c = 2 * Math.PI * r;
                  let offset = 0;
                  return metrics.stockDist.map((seg) => {
                    const frac = seg.qty / totalStockUnitsDist;
                    const dash = frac * c;
                    const curOffset = offset;
                    offset += dash;
                    return (
                      <circle
                        key={seg.category}
                        cx="70"
                        cy="70"
                        r={r}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="22"
                        strokeDasharray={`${Math.max(0, dash - 1.5)} ${c - Math.max(0, dash - 1.5)}`}
                        strokeDashoffset={-curOffset}
                        transform="rotate(-90 70 70)"
                      />
                    );
                  });
                })()}
                <text x="70" y="68" textAnchor="middle" className="fill-[#0B1221] font-mono text-sm font-bold">
                  {formatNumber(metrics.totalWarehouseStock)}
                </text>
                <text x="70" y="82" textAnchor="middle" className="fill-slate-400 text-[9px]">
                  Total Units
                </text>
              </svg>

              <div className="w-full flex-1 space-y-2 text-xs">
                {metrics.stockDist.map((seg) => (
                  <div key={seg.category} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-slate-700">{seg.category}</span>
                    </div>
                    <span className="font-mono font-semibold text-[#0B1221] tabular-nums">
                      {formatNumber(seg.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Operational Alerts Strip */}
      {alerts.length > 0 && (
        <div className="erp-card rounded-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3">
            <h3 className="font-display text-sm font-bold text-[#0B1221]">
              {t(lang, 'notifications')} ({alerts.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {alerts.slice(0, 6).map((al) => (
              <div
                key={al.id}
                className="flex items-center justify-between gap-4 px-5 py-2.5 text-xs hover:bg-slate-50/80"
              >
                <div className="min-w-0">
                  <span
                    className={`font-semibold ${
                      al.severity === 'critical'
                        ? 'text-[#DC2626]'
                        : al.severity === 'warning'
                        ? 'text-amber-700'
                        : 'text-[#2563EB]'
                    }`}
                  >
                    {al.title}
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-600">{al.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(al.targetTab as NavTab)}
                  className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#2563EB] hover:underline"
                >
                  <span>Review</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analytics & Operational Tables */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Low Stock Products */}
        <div className="erp-card overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5">
            <h3 className="font-display text-sm font-bold text-[#0B1221]">
              {t(lang, 'low_stock_products')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('warehouse')}
              className="text-xs font-semibold text-[#0F766E] hover:underline"
            >
              Open Stock Manager
            </button>
          </div>
          {metrics.lowStockList.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">
              All active warehouse products are above minimum stock levels.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 text-right font-medium">Available</th>
                    <th className="px-4 py-2.5 text-right font-medium">Min Alert</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.lowStockList.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{p.name}</div>
                        <div className="font-mono text-[11px] text-slate-500">{p.sku}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {p.availableQty} {p.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-500 tabular-nums">
                        {p.minStockAlert}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`font-semibold ${
                            p.availableQty <= 0 ? 'text-[#DC2626]' : 'text-amber-700'
                          }`}
                        >
                          {p.availableQty <= 0 ? 'Out of Stock' : 'Low Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Selling Products */}
        {caps.canViewCustomerLedgers && (
          <div className="erp-card overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5">
              <h3 className="font-display text-sm font-bold text-[#0B1221]">
                {t(lang, 'top_selling_products')}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-semibold text-[#2563EB] hover:underline"
              >
                Full Report
              </button>
            </div>
            {metrics.topProducts.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                No sales recorded in selected date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Product</th>
                      <th className="px-4 py-2.5 text-right font-medium">Qty Sold</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.topProducts.map((tp) => (
                      <tr key={tp.sku} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{tp.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{tp.sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {formatNumber(tp.qty)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#0B1221] tabular-nums">
                          {formatINR(tp.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Top Purchasing Shops */}
        {caps.canViewCustomerLedgers && (
          <div className="erp-card overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5">
              <h3 className="font-display text-sm font-bold text-[#0B1221]">
                {t(lang, 'top_purchasing_shops')}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('shops')}
                className="text-xs font-semibold text-[#0891B2] hover:underline"
              >
                All Shops
              </button>
            </div>
            {metrics.topShops.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                No shop dispatches recorded in selected date range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Shop / Area</th>
                      <th className="px-4 py-2.5 text-right font-medium">Bills</th>
                      <th className="px-4 py-2.5 text-right font-medium">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.topShops.map((ts) => (
                      <tr key={ts.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{ts.name}</div>
                          <div className="text-[11px] text-slate-500">{ts.block}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {ts.orders}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#0B1221] tabular-nums">
                          {formatINR(ts.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Recent Transactions */}
        <div className="erp-card overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5">
            <h3 className="font-display text-sm font-bold text-[#0B1221]">
              {t(lang, 'recent_transactions')}
            </h3>
            {caps.canAccessBillBook && (
              <button
                type="button"
                onClick={() => onNavigate('billbook')}
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                Open Bill Book
              </button>
            )}
          </div>
          {metrics.recentTx.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">No recent transactions yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.recentTx.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onNavigate(tx.tab)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-xs hover:bg-slate-50/80"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{tx.party}</div>
                    <div className="text-[11px] text-slate-500">
                      {tx.type} · <span className="font-mono">{tx.ref}</span> · {formatDateDDMMYYYY(tx.date)}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono font-bold text-[#0B1221] tabular-nums">
                    {formatINR(tx.amount)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Employee Activities */}
      <div className="erp-card overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5">
          <h3 className="font-display text-sm font-bold text-[#0B1221]">
            {t(lang, 'recent_activities')}
          </h3>
          {caps.canManageUsers && (
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              Full Audit Log
            </button>
          )}
        </div>
        {auditLogs.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-slate-500">No activities logged yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {auditLogs
              .slice()
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              .slice(0, 8)
              .map((log) => (
                <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-xs">
                  <div>
                    <div className="font-medium text-slate-900">{log.details}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {log.userName} · {log.userRole} · {log.module}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                    {formatTimestampIST(log.createdAt)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
