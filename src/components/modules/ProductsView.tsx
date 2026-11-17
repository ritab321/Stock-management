import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Download, Layers, Plus, Search, Upload } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { importProductsBatch, saveProduct } from '../../lib/erpService';
import { exportRowsToCSV, exportRowsToXLSX } from '../../lib/exportUtils';
import { storage } from '../../lib/firebase';
import {
  compressImageToDataUrl,
  formatDateDDMMYYYY,
  formatINR,
  formatNumber,
} from '../../lib/formatters';
import { t } from '../../lib/i18n';
import type { Product } from '../../types/erp';
import { Modal } from '../ui/Modal';
import { ProductThumb } from '../ui/ProductThumb';

const UNITS = ['Piece', 'Box', 'Packet', 'Carton', 'Dozen', 'Set'];

export const ProductsView: React.FC = () => {
  const { profile, caps, lang, products, stockBatches } = useErp();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'active'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [batchModalProd, setBatchModalProd] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    brand: '',
    category: 'Mobile Accessories',
    imageUrl: '',
    purchasePrice: 0,
    sellingPrice: 0,
    minStockAlert: 10,
    availableQty: 0,
    damagedQty: 0,
    unit: 'Piece',
    status: 'active' as 'active' | 'inactive',
    warehouseZone: 'Main Rack A',
  });

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (catFilter !== 'all' && p.category !== catFilter) return false;
        if (stockFilter === 'low' && !(p.availableQty > 0 && p.availableQty <= p.minStockAlert))
          return false;
        if (stockFilter === 'out' && p.availableQty > 0) return false;
        if (stockFilter === 'active' && p.status !== 'active') return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, catFilter, stockFilter]);

  const openAdd = () => {
    setEditing(null);
    setErr(null);
    setForm({
      name: '',
      sku: `PDP-${Math.floor(1000 + Math.random() * 9000)}`,
      barcode: '',
      brand: '',
      category: 'Audio & Earbuds',
      imageUrl: '',
      purchasePrice: 0,
      sellingPrice: 0,
      minStockAlert: 10,
      availableQty: 0,
      damagedQty: 0,
      unit: 'Piece',
      status: 'active',
      warehouseZone: 'Main Rack A',
    });
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setErr(null);
    setForm({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      brand: p.brand || '',
      category: p.category,
      imageUrl: p.imageUrl || '',
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      minStockAlert: p.minStockAlert,
      availableQty: p.availableQty,
      damagedQty: p.damagedQty,
      unit: p.unit,
      status: p.status,
      warehouseZone: p.warehouseZone || 'Main Rack A',
    });
    setModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    setErr(null);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
      try {
        const snap = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snap.ref);
        setForm((f) => ({ ...f, imageUrl: url }));
      } catch {
        // Fallback to compact compressed JPEG data URL if Storage bucket rules are not enabled
        const compressed = await compressImageToDataUrl(file, 260, 0.72);
        setForm((f) => ({ ...f, imageUrl: compressed }));
      }
    } catch (uploadErr) {
      setErr(uploadErr instanceof Error ? uploadErr.message : 'Image upload failed.');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!form.name.trim() || !form.sku.trim()) {
      setErr('Product name and SKU are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await saveProduct(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        { id: editing?.id, ...form },
        !editing
      );
      setModalOpen(false);
    } catch (saveErr) {
      setErr(saveErr instanceof Error ? saveErr.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = (kind: 'xlsx' | 'csv') => {
    const headers = [
      'Name',
      'SKU',
      'Barcode',
      'Brand',
      'Category',
      ...(caps.canViewPurchasePrices ? ['Purchase Price'] : []),
      'Selling Price',
      'Available Qty',
      'Damaged Qty',
      'Min Alert',
      'Unit',
      'Zone',
      'Status',
    ];
    const rows = filtered.map((p) => [
      p.name,
      p.sku,
      p.barcode || '',
      p.brand || '',
      p.category,
      ...(caps.canViewPurchasePrices ? [p.purchasePrice] : []),
      p.sellingPrice,
      p.availableQty,
      p.damagedQty,
      p.minStockAlert,
      p.unit,
      p.warehouseZone || '',
      p.status,
    ]);
    if (kind === 'xlsx') {
      exportRowsToXLSX('pramanik-products.xlsx', 'Products', headers, rows);
    } else {
      exportRowsToCSV('pramanik-products.csv', headers, rows);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const parsed = json.map((r) => ({
        name: String(r.Name || r.name || '').trim(),
        sku: String(r.SKU || r.sku || '').trim(),
        barcode: String(r.Barcode || r.barcode || ''),
        brand: String(r.Brand || r.brand || ''),
        category: String(r.Category || r.category || 'Mobile Accessories'),
        purchasePrice: Number(r['Purchase Price'] || r.purchasePrice || 0),
        sellingPrice: Number(r['Selling Price'] || r.sellingPrice || 0),
        minStockAlert: Number(r['Min Alert'] || r.minStockAlert || 10),
        availableQty: Number(r['Available Qty'] || r.availableQty || 0),
        unit: String(r.Unit || r.unit || 'Piece'),
      }));
      const count = await importProductsBatch(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        parsed
      );
      setErr(null);
      window.dispatchEvent(new CustomEvent('pdp-toast', { detail: `Imported ${count} products.` }));
    } catch (impErr) {
      setErr(impErr instanceof Error ? impErr.message : 'Failed to import file.');
    } finally {
      e.target.value = '';
    }
  };

  const selectedProdBatches = useMemo(() => {
    if (!batchModalProd) return [];
    return stockBatches
      .filter((b) => b.productId === batchModalProd.id)
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [batchModalProd, stockBatches]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, brand, barcode..."
              className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Stock States</option>
            <option value="active">Active Only</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t(lang, 'export_xlsx')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t(lang, 'export_csv')}</span>
          </button>
          {caps.canManageProducts && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{t(lang, 'import_csv_xlsx')}</span>
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Product</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category / Brand</th>
              {caps.canViewPurchasePrices && (
                <th className="px-4 py-3 text-right font-medium">Purchase Rate</th>
              )}
              <th className="px-4 py-3 text-right font-medium">Wholesale Price</th>
              <th className="px-4 py-3 text-right font-medium">Available Stock</th>
              <th className="px-4 py-3 text-right font-medium">Damaged</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
              filtered.map((p) => {
                const isLow = p.availableQty > 0 && p.availableQty <= p.minStockAlert;
                const isOut = p.availableQty <= 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={p.imageUrl} alt={p.name} size="md" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                            {p.sku}
                            {p.barcode ? ` · ${p.barcode}` : ''}
                            {p.warehouseZone ? ` · ${p.warehouseZone}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{p.category}</div>
                      <div className="text-[11px] text-slate-400">{p.brand || '-'}</div>
                    </td>
                    {caps.canViewPurchasePrices && (
                      <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                        {formatINR(p.purchasePrice)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatINR(p.sellingPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span
                        className={`font-semibold ${
                          isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(p.availableQty)} {p.unit}
                      </span>
                      <div className="text-[11px] text-slate-400">Min: {p.minStockAlert}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600 tabular-nums">
                      {p.damagedQty || 0}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-medium ${
                          p.status === 'active' ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {p.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {caps.canViewPurchasePrices && (
                          <button
                            type="button"
                            onClick={() => setBatchModalProd(p)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                          >
                            <Layers className="h-3 w-3" />
                            <span>Batches</span>
                          </button>
                        )}
                        {caps.canManageProducts && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
                          >
                            Edit
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

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Product: ${editing.name}` : 'Add New Wholesale Product'}
        subtitle="Manage catalog pricing, minimum stock threshold, and warehouse zone."
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">Product Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">SKU / Product Code *</label>
              <input
                type="text"
                required
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Barcode (Optional)</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Brand</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Category *</label>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Purchase Price (₹) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Wholesale Selling Price (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Unit *</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Minimum Stock Alert *</label>
              <input
                type="number"
                min="0"
                required
                value={form.minStockAlert}
                onChange={(e) => setForm({ ...form, minStockAlert: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">
                Available Quantity {editing ? '(Current)' : '(Opening Stock)'}
              </label>
              <input
                type="number"
                min="0"
                value={form.availableQty}
                onChange={(e) => setForm({ ...form, availableQty: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Warehouse Zone</label>
              <input
                type="text"
                value={form.warehouseZone}
                onChange={(e) => setForm({ ...form, warehouseZone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-slate-700">Product Image</label>
              <div className="flex items-center gap-3">
                <ProductThumb src={form.imageUrl} alt={form.name || 'Product'} size="md" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="text-xs text-slate-600"
                />
              </div>
              {uploadingImg && <p className="mt-1 text-[11px] text-blue-600">Uploading image...</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || uploadingImg}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase Batches Modal */}
      <Modal
        open={Boolean(batchModalProd)}
        onClose={() => setBatchModalProd(null)}
        title={`Purchase Price Batches — ${batchModalProd?.name || ''}`}
        subtitle="FIFO batch cost layers used for exact COGS and inventory valuation."
      >
        {selectedProdBatches.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No purchase batches recorded for this product yet.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Batch No</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Unit Cost</th>
                <th className="px-3 py-2 text-right font-medium">Initial Qty</th>
                <th className="px-3 py-2 text-right font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedProdBatches.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-mono text-slate-900">{b.batchNo}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">
                    {formatDateDDMMYYYY(b.purchaseDate)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                    {formatINR(b.unitCost)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{b.initialQty}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700">
                    {b.remainingQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
};
