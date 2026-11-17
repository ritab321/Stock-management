import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Database,
  TrendingUp,
  Package,
  Store,
  Truck,
  IndianRupee,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
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
import { seedDemoData } from '../../lib/demoSeed';
import type { NavTab } from '../../types/erp';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
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
    sales,
    saleItems,
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

  const range = useMemo(
    () => getDateRangeForPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const metrics = useMemo(() => {
    const activeProducts = products.filter((p) => p.status === 'active');
    const totalProducts = activeProducts.length;
    const totalWarehouseStock = activeProducts.reduce((sum, p) => sum + (p.availableQty || 0), 0);

    // Value warehouse stock using remaining batch costs where available, else purchasePrice
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
    const todayDeliveries = sales.filter(
      (s) => s.saleDate === today && s.deliveryStatus !== 'reversed'
    ).length;

    const periodSales = sales.filter(
      (s) => s.deliveryStatus !== 'reversed' && isDateInRange(s.saleDate, range.from, range.to)
    );
    const periodSalesTotal = periodSales.reduce((sum, s) => sum + (s.netTotal || 0), 0);
    const periodGrossProfit = periodSales.reduce((sum, s) => sum + (s.grossProfit || 0), 0);

    const periodPaymentsCollected = payments
      .filter(
        (p) =>
          p.partyType === 'shop' &&
          p.status === 'active' &&
          p.paymentKind !== 'refund' &&
          p.paymentKind !== 'credit_note' &&
          isDateInRange(p.paymentDate, range.from, range.to)
      )
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const shopOutstanding = shops.reduce((sum, s) => sum + (s.currentOutstanding || 0), 0);
    const supplierOutstanding = suppliers.reduce((sum, s) => sum + (s.outstandingPayable || 0), 0);

    // Top Selling Products in selected period
    const periodSaleIds = new Set(periodSales.map((s) => s.id));
    const prodAgg = new Map<string, { name: string; sku: string; qty: number; revenue: number }>();
    for (const it of saleItems) {
      if (!periodSaleIds.has(it.saleId)) continue;
      const cur = prodAgg.get(it.productId) || {
        name: it.productName,
        sku: it.sku,
        qty: 0,
        revenue: 0,
      };
      cur.qty += it.orderedQty;
      cur.revenue += it.lineTotal;
      prodAgg.set(it.productId, cur);
    }
    const topProducts = Array.from(prodAgg.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    // Top Purchasing Shops in selected period
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
    const topShops = Array.from(shopAgg.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const lowStockList = activeProducts
      .filter((p) => p.availableQty <= p.minStockAlert)
      .sort((a, b) => a.availableQty - b.availableQty)
      .slice(0, 8);

    return {
      totalProducts,
      totalWarehouseStock,
      totalStockValue,
      totalShops,
      todayDeliveries,
      periodDeliveries: periodSales.length,
      periodSalesTotal,
      periodGrossProfit,
      periodPaymentsCollected,
      shopOutstanding,
      supplierOutstanding,
      topProducts,
      topShops,
      lowStockList,
    };
  }, [products, stockBatches, shops, suppliers, sales, saleItems, payments, range]);

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

  return (
    <div className="space-y-6">
      {/* Date Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              ['today', t(lang, 'date_today')],
              ['yesterday', t(lang, 'date_yesterday')],
              ['this_week', t(lang, 'date_this_week')],
              ['this_month', t(lang, 'date_this_month')],
              ['custom', t(lang, 'date_custom')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === key
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
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
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/70 px-5 py-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Initialize Pramanik Stock Manager Workspace
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Your Firestore database is connected and empty. Load clearly marked DEMO records (Paschim Medinipur shops, suppliers, warehouse & direct dispatches) to test all calculations, or start adding real entries directly.
              </p>
              {seedErr && <p className="mt-1 text-xs text-red-600">{seedErr}</p>}
            </div>
          </div>
          <button
            type="button"
            disabled={seeding}
            onClick={handleLoadDemo}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {seeding ? 'Loading Demo Data...' : t(lang, 'load_demo')}
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>{t(lang, 'kpi_total_products')}</span>
            <Package className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatNumber(metrics.totalProducts)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {metrics.lowStockList.length} low / out of stock
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>{t(lang, 'kpi_warehouse_stock')}</span>
            <Package className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatNumber(metrics.totalWarehouseStock)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Units in central warehouse</p>
        </div>

        {caps.canViewPurchasePrices && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_stock_value')}</span>
              <IndianRupee className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {formatINR(metrics.totalStockValue)}
            </p>
            <p className="mt-1 text-xs text-slate-500">At actual batch purchase cost</p>
          </div>
        )}

        {caps.canViewCustomerLedgers && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_total_shops')}</span>
              <Store className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatNumber(metrics.totalShops)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Active retailers in network</p>
          </div>
        )}

        {caps.canViewCustomerLedgers && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_deliveries')}</span>
              <Truck className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {formatNumber(metrics.periodDeliveries)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Today: {metrics.todayDeliveries} invoices
            </p>
          </div>
        )}

        {caps.canViewCustomerLedgers && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_monthly_sales')}</span>
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold text-slate-900 tabular-nums">
              {formatINR(metrics.periodSalesTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Net invoiced revenue</p>
          </div>
        )}

        {caps.canRecordShopPayments && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_payments_collected')}</span>
              <IndianRupee className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
              {formatINR(metrics.periodPaymentsCollected)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Shop collections in period</p>
          </div>
        )}

        {caps.canViewCustomerLedgers && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_shop_outstanding')}</span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold text-amber-700 tabular-nums">
              {formatINR(metrics.shopOutstanding)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Total receivable from shops</p>
          </div>
        )}

        {caps.canViewSupplierFinancials && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_supplier_outstanding')}</span>
              <IndianRupee className="h-4 w-4 text-red-600" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold text-red-700 tabular-nums">
              {formatINR(metrics.supplierOutstanding)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Total payable to suppliers</p>
          </div>
        )}

        {caps.canViewProfitMetrics && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t(lang, 'kpi_gross_profit')}</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
              {formatINR(metrics.periodGrossProfit)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Net Sales minus COGS</p>
          </div>
        )}
      </div>

      {/* Operational Alerts Strip */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {t(lang, 'notifications')} ({alerts.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {alerts.slice(0, 6).map((al) => (
              <div
                key={al.id}
                className="flex items-center justify-between gap-4 px-5 py-2.5 text-xs hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <span
                    className={`font-semibold ${
                      al.severity === 'critical'
                        ? 'text-red-700'
                        : al.severity === 'warning'
                        ? 'text-amber-700'
                        : 'text-blue-700'
                    }`}
                  >
                    [{al.severity.toUpperCase()}] {al.title}
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-600">{al.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(al.targetTab as NavTab)}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-blue-600 hover:text-blue-800"
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
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              {t(lang, 'low_stock_products')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('warehouse')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Open Warehouse
            </button>
          </div>
          {metrics.lowStockList.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">
              All active warehouse products are above minimum stock levels.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 text-right font-medium">Available</th>
                    <th className="px-4 py-2.5 text-right font-medium">Min Alert</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.lowStockList.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
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
                            p.availableQty <= 0 ? 'text-red-600' : 'text-amber-600'
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
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {t(lang, 'top_selling_products')}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="text-xs font-medium text-blue-600 hover:underline"
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
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Product</th>
                      <th className="px-4 py-2.5 text-right font-medium">Qty Sold</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.topProducts.map((tp) => (
                      <tr key={tp.sku} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{tp.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{tp.sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {formatNumber(tp.qty)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
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
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {t(lang, 'top_purchasing_shops')}
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('shops')}
                className="text-xs font-medium text-blue-600 hover:underline"
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
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Shop / Area</th>
                      <th className="px-4 py-2.5 text-right font-medium">Invoices</th>
                      <th className="px-4 py-2.5 text-right font-medium">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.topShops.map((ts) => (
                      <tr key={ts.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{ts.name}</div>
                          <div className="text-[11px] text-slate-500">{ts.block}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {ts.orders}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
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

        {/* Recent Activities */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              {t(lang, 'recent_activities')}
            </h3>
            {caps.canManageUsers && (
              <button
                type="button"
                onClick={() => onNavigate('users')}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Audit Log
              </button>
            )}
          </div>
          {auditLogs.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">
              No activities logged yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs
                .slice()
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 7)
                .map((log) => (
                  <div key={log.id} className="px-5 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{log.details}</span>
                      <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                        {formatTimestampIST(log.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {log.userName} · {log.userRole} · {log.module}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
