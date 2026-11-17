import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, ClipboardCheck, Download, Plus, Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { recordWarehouseOperation } from '../../lib/erpService';
import { exportRowsToXLSX } from '../../lib/exportUtils';
import { formatDateDDMMYYYY, formatINR, formatNumber, getTodayIST } from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { MovementType } from '../../types/erp';
import { Modal } from '../ui/Modal';

export const WarehouseView: React.FC = () => {
  const { profile, caps, lang, products, stockMovements, settings } = useErp();
  const [tab, setTab] = useState<'inventory' | 'ledger'>('inventory');
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [productLedgerFilter, setProductLedgerFilter] = useState('all');
  const [opModal, setOpModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    productId: '',
    date: getTodayIST(),
    movementType: 'stock_in' as MovementType,
    qty: 1,
    warehouseZone: 'Main Rack A',
    notes: '',
  });

  const zones = useMemo(
    () => Array.from(new Set(products.map((p) => p.warehouseZone || 'Main Rack A'))).sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (zoneFilter !== 'all' && (p.warehouseZone || 'Main Rack A') !== zoneFilter) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, zoneFilter]);

  const filteredMovements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockMovements
      .filter((m) => {
        if (productLedgerFilter !== 'all' && m.productId !== productLedgerFilter) return false;
        if (!q) return true;
        return (
          m.productName.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q) ||
          (m.referenceNumber || '').toLowerCase().includes(q) ||
          (m.notes || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [stockMovements, search, productLedgerFilter]);

  const openOperation = (defaultType: MovementType, prodId?: string) => {
    const p = products.find((x) => x.id === prodId) || products[0];
    setErr(null);
    setForm({
      productId: p?.id || '',
      date: getTodayIST(),
      movementType: defaultType,
      qty: defaultType === 'verification' ? p?.availableQty || 0 : 1,
      warehouseZone: p?.warehouseZone || 'Main Rack A',
      notes: '',
    });
    setOpModal(true);
  };

  const handleOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form.productId) return;
    setSaving(true);
    setErr(null);
    try {
      await recordWarehouseOperation(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          ...form,
          allowNegativeStock: Boolean(settings?.allowNegativeStock),
        }
      );
      setOpModal(false);
    } catch (opErr) {
      setErr(opErr instanceof Error ? opErr.message : 'Stock operation failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportWarehouse = () => {
    const headers = [
      'Product',
      'SKU',
      'Zone',
      'Sellable Qty',
      'Damaged Qty',
      'Min Alert',
      'Unit',
      ...(caps.canViewPurchasePrices ? ['Unit Cost', 'Stock Value'] : []),
    ];
    const rows = filteredProducts.map((p) => [
      p.name,
      p.sku,
      p.warehouseZone || 'Main Rack A',
      p.availableQty,
      p.damagedQty,
      p.minStockAlert,
      p.unit,
      ...(caps.canViewPurchasePrices
        ? [p.purchasePrice, p.availableQty * p.purchasePrice]
        : []),
    ]);
    exportRowsToXLSX('warehouse-stock-report.xlsx', 'Warehouse Stock', headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('inventory')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === 'inventory' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Warehouse Stock Report
            </button>
            <button
              type="button"
              onClick={() => setTab('ledger')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === 'ledger' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Product Stock Movement Ledger
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU, reference..."
              className="w-60 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs"
            />
          </div>

          {tab === 'inventory' ? (
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              <option value="all">All Warehouse Zones</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={productLedgerFilter}
              onChange={(e) => setProductLedgerFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              <option value="all">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportWarehouse}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Stock</span>
          </button>
          {caps.canManageWarehouse && (
            <>
              <button
                type="button"
                onClick={() => openOperation('verification')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                <span>Physical Verification</span>
              </button>
              <button
                type="button"
                onClick={() => openOperation('stock_in')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Stock Movement / Adjust</span>
              </button>
            </>
          )}
        </div>
      </div>

      {tab === 'inventory' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Warehouse Zone</th>
                <th className="px-4 py-3 text-right font-medium">Sellable Stock</th>
                <th className="px-4 py-3 text-right font-medium">Damaged Stock</th>
                {caps.canViewPurchasePrices && (
                  <th className="px-4 py-3 text-right font-medium">Stock Valuation</th>
                )}
                <th className="px-4 py-3 text-right font-medium">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {t(lang, 'no_records')}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{p.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.warehouseZone || 'Main Rack A'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      <span
                        className={
                          p.availableQty <= 0
                            ? 'text-red-600'
                            : p.availableQty <= p.minStockAlert
                            ? 'text-amber-600'
                            : 'text-slate-900'
                        }
                      >
                        {formatNumber(p.availableQty)} {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-700 tabular-nums">
                      {formatNumber(p.damagedQty || 0)}
                    </td>
                    {caps.canViewPurchasePrices && (
                      <td className="px-4 py-3 text-right font-mono text-slate-800 tabular-nums">
                        {formatINR(p.availableQty * p.purchasePrice)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setProductLedgerFilter(p.id);
                            setTab('ledger');
                          }}
                          className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                        >
                          Ledger
                        </button>
                        {caps.canManageWarehouse && (
                          <button
                            type="button"
                            onClick={() => openOperation('transfer', p.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50"
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            <span>Adjust/Transfer</span>
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
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Movement Type</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Zone / Reference</th>
                <th className="px-4 py-3 font-medium">By / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {t(lang, 'no_records')}
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {formatDateDDMMYYYY(m.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{m.productName}</div>
                      <div className="font-mono text-[11px] text-slate-400">{m.sku}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-medium ${
                          m.direction === 'in'
                            ? 'text-emerald-700'
                            : m.direction === 'out'
                            ? 'text-red-700'
                            : 'text-blue-700'
                        }`}
                      >
                        {m.movementType.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {m.direction === 'in' ? '+' : m.direction === 'out' ? '-' : ''}
                      {m.qty}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{m.warehouseZone || '-'}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {m.referenceNumber || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{m.notes || '-'}</div>
                      <div className="text-[11px] text-slate-400">By {m.createdByName}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Warehouse Operation Modal */}
      <Modal
        open={opModal}
        onClose={() => setOpModal(false)}
        title="Warehouse Stock Operation"
        subtitle="All stock adjustments, transfers, damaged entries, and verifications are permanently logged."
      >
        <form onSubmit={handleOperation} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-700">Operation Type *</label>
              <select
                value={form.movementType}
                onChange={(e) =>
                  setForm({ ...form, movementType: e.target.value as MovementType })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="stock_in">Stock In (+)</option>
                <option value="stock_out">Stock Out (-)</option>
                <option value="adjustment">Stock Adjustment (+/- signed)</option>
                <option value="damaged">Mark Damaged Stock</option>
                <option value="transfer">Warehouse Zone Transfer</option>
                <option value="verification">Physical Stock Verification (Set Actual Count)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Product *</label>
              <select
                required
                value={form.productId}
                onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    productId: e.target.value,
                    warehouseZone: p?.warehouseZone || 'Main Rack A',
                  });
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — Current: {p.availableQty} {p.unit}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">
                {form.movementType === 'verification'
                  ? 'Physical Counted Qty *'
                  : form.movementType === 'adjustment'
                  ? 'Adjustment (+/- Qty) *'
                  : 'Quantity *'}
              </label>
              <input
                type="number"
                required
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700">Warehouse Zone</label>
              <input
                type="text"
                value={form.warehouseZone}
                onChange={(e) => setForm({ ...form, warehouseZone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Notes / Reason *</label>
              <input
                type="text"
                required
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Reason for adjustment, transfer destination, or verification note"
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setOpModal(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Recording...' : 'Confirm Movement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
