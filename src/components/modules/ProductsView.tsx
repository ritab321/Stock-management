import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Download, Eye, Layers, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { deleteProductSafe, importProductsBatch, saveProduct } from '../../lib/erpService';
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
  const {
    profile,
    caps,
    lang,
    products,
    stockBatches,
    purchaseItems,
    purchases,
    saleItems,
    sales,
    invoiceItems,
    invoices,
    stockMovements,
    returns,
    settings,
  } = useErp();

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'active'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [detailProd, setDetailProd] = useState<Product | null>(null);
  const [detailTab, setDetailTab] = useState<'batches' | 'purchases' | 'sales' | 'movements'>('batches');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const defaultThreshold = settings?.defaultLowStockThreshold ?? 10;

  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    brand: '',
    category: 'Mobile Accessories',
    description: '',
    imageUrl: '',
    purchasePrice: 0,
    sellingPrice: 0,
    minStockAlert: defaultThreshold,
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

  const brands = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand || '').filter(Boolean))).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (catFilter !== 'all' && p.category !== catFilter) return false;
        if (brandFilter !== 'all' && (p.brand || '') !== brandFilter) return false;
        if (stockFilter === 'low' && !(p.availableQty > 0 && p.availableQty <= p.minStockAlert))
          return false;
        if (stockFilter === 'out' && p.availableQty > 0) return false;
        if (stockFilter === 'active' && p.status !== 'active') return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, catFilter, brandFilter, stockFilter]);

  const productHasTransactions = (productId: string): boolean => {
    return (
      purchaseItems.some((pi) => pi.productId === productId) ||
      saleItems.some((si) => si.productId === productId) ||
      invoiceItems.some((ii) => ii.productId === productId) ||
      stockMovements.some((m) => m.productId === productId) ||
      returns.some((r) => r.productId === productId) ||
      stockBatches.some((b) => b.productId === productId)
    );
  };

  const openAdd = () => {
    setEditing(null);
    setErr(null);
    setForm({
      name: '',
      sku: `PDP-${Math.floor(1000 + Math.random() * 9000)}`,
      barcode: '',
      brand: '',
      category: 'Audio & Earbuds',
      description: '',
      imageUrl: '',
      purchasePrice: 0,
      sellingPrice: 0,
      minStockAlert: defaultThreshold,
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
      description: p.description || '',
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

  const openDetail = (p: Product, initialTab: typeof detailTab = 'batches') => {
    setDetailProd(p);
    setDetailTab(initialTab);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    setErr(null);
    try {
      const storageRef = ref(
        storage,
        `products/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      );
      try {
        const snap = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snap.ref);
        setForm((f) => ({ ...f, imageUrl: url }));
      } catch {
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

  const handleConfirmDelete = async () => {
    if (!profile || !deleteTarget) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteProductSafe(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        deleteTarget,
        productHasTransactions(deleteTarget.id)
      );
      setDeleteTarget(null);
      window.dispatchEvent(
        new CustomEvent('pdp-toast', { detail: `Deleted product ${deleteTarget.name}` })
      );
    } catch (delErr) {
      setErr(delErr instanceof Error ? delErr.message : 'Failed to delete product.');
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
      'Description',
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
      p.description || '',
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
        minStockAlert: Number(r['Min Alert'] || r.minStockAlert || defaultThreshold),
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

  // Detail modal computed histories
  const selectedProdBatches = useMemo(() => {
    if (!detailProd) return [];
    return stockBatches
      .filter((b) => b.productId === detailProd.id)
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [detailProd, stockBatches]);

  const selectedProdPurchases = useMemo(() => {
    if (!detailProd) return [];
    const purMap = new Map(purchases.map((p) => [p.id, p]));
    return purchaseItems
      .filter((pi) => pi.productId === detailProd.id)
      .map((pi) => {
        const p = purMap.get(pi.purchaseId);
        return {
          id: pi.id,
          date: p?.purchaseDate || '',
          invoiceNo: p?.invoiceNumber || '-',
          supplierName: p?.supplierName || '-',
          type: p?.purchaseType || 'warehouse',
          qty: pi.qty,
          rate: pi.unitRate,
          total: pi.lineTotal,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [detailProd, purchaseItems, purchases]);

  const selectedProdSales = useMemo(() => {
    if (!detailProd) return [];
    const saleMap = new Map(sales.map((s) => [s.id, s]));
    const invMap = new Map(invoices.map((inv) => [inv.id, inv]));
    const rows: Array<{
      id: string;
      source: 'Dispatch' | 'Bill Book';
      date: string;
      invoiceNo: string;
      shopName: string;
      qty: number;
      rate: number;
      total: number;
    }> = [];
    for (const si of saleItems) {
      if (si.productId !== detailProd.id) continue;
      const s = saleMap.get(si.saleId);
      if (s && s.deliveryStatus !== 'reversed') {
        rows.push({
          id: si.id,
          source: 'Dispatch',
          date: s.saleDate,
          invoiceNo: s.invoiceNumber,
          shopName: s.shopName,
          qty: si.deliveredQty,
          rate: si.sellingPrice,
          total: si.lineTotal,
        });
      }
    }
    for (const ii of invoiceItems) {
      if (ii.productId !== detailProd.id) continue;
      const inv = invMap.get(ii.invoiceId);
      if (inv && inv.status === 'confirmed') {
        rows.push({
          id: ii.id,
          source: 'Bill Book',
          date: inv.invoiceDate,
          invoiceNo: inv.invoiceNumber,
          shopName: inv.shopName,
          qty: ii.qty,
          rate: ii.rate,
          total: ii.amount,
        });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [detailProd, saleItems, sales, invoiceItems, invoices]);

  const selectedProdMovements = useMemo(() => {
    if (!detailProd) return [];
    return stockMovements
      .filter((m) => m.productId === detailProd.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [detailProd, stockMovements]);

  return (
    <div className="space-y-4">
      {err && !modalOpen && !deleteTarget && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {err}
        </div>
      )}

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
              className="w-60 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
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
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
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
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t(lang, 'export_xlsx')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{t(lang, 'import_csv_xlsx')}</span>
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
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
                const hasTx = productHasTransactions(p.id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={p.imageUrl} alt={p.name} size="md" />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openDetail(p, 'batches')}
                            className="text-left font-medium text-teal-800 hover:underline"
                          >
                            {p.name}
                          </button>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                            {p.sku}
                            {p.barcode ? ` · ${p.barcode}` : ''}
                            {p.warehouseZone ? ` · ${p.warehouseZone}` : ''}
                          </div>
                          {p.description && (
                            <div className="mt-0.5 max-w-xs truncate text-[11px] text-slate-400">
                              {p.description}
                            </div>
                          )}
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
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetail(p, caps.canViewPurchasePrices ? 'batches' : 'sales')}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                          title="View product profile, batches & ledger"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Details</span>
                        </button>
                        {caps.canViewPurchasePrices && (
                          <button
                            type="button"
                            onClick={() => openDetail(p, 'batches')}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50"
                          >
                            <Layers className="h-3 w-3" />
                            <span>Batches</span>
                          </button>
                        )}
                        {caps.canManageProducts && (
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="whitespace-nowrap rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-teal-700 hover:bg-teal-50"
                          >
                            Edit
                          </button>
                        )}
                        {caps.canDeleteProducts && (
                          <button
                            type="button"
                            onClick={() => {
                              setErr(null);
                              setDeleteTarget(p);
                            }}
                            title={
                              hasTx
                                ? 'Linked to transactions (cannot hard-delete)'
                                : 'Delete unused product'
                            }
                            className={`inline-flex items-center rounded border px-1.5 py-1 text-[11px] ${
                              hasTx
                                ? 'border-slate-200 text-slate-300 hover:text-slate-500'
                                : 'border-red-200 text-red-600 hover:bg-red-50'
                            }`}
                          >
                            <Trash2 className="h-3 w-3" />
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
        subtitle="Manage catalog pricing, description, minimum stock threshold, and warehouse zone."
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

            <div className="sm:col-span-2">
              <label className="mb-1 block font-medium text-slate-700">
                Description / Specification (Optional)
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g., 20W PD Fast Charger Type-C with 6 month warranty"
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
              {uploadingImg && <p className="mt-1 text-[11px] text-teal-700">Uploading image...</p>}
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
              className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : t(lang, 'save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Product Detail Modal (Batches, Purchases, Sales & Bill Book, Stock Ledger) */}
      <Modal
        open={Boolean(detailProd)}
        onClose={() => setDetailProd(null)}
        title={detailProd?.name || 'Product Details'}
        subtitle={
          detailProd
            ? `SKU: ${detailProd.sku} · ${detailProd.category}${detailProd.brand ? ` · ${detailProd.brand}` : ''} · Zone: ${detailProd.warehouseZone || 'Main Rack A'}`
            : undefined
        }
        size="xl"
      >
        {detailProd && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] text-slate-500">Wholesale Rate</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {formatINR(detailProd.sellingPrice)}
                </div>
              </div>
              {caps.canViewPurchasePrices && (
                <div>
                  <div className="text-[11px] text-slate-500">Purchase Rate</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-slate-700 tabular-nums">
                    {formatINR(detailProd.purchasePrice)}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] text-slate-500">Sellable Stock</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-teal-700 tabular-nums">
                  {formatNumber(detailProd.availableQty)} {detailProd.unit}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Damaged Stock</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-red-700 tabular-nums">
                  {formatNumber(detailProd.damagedQty || 0)} {detailProd.unit}
                </div>
              </div>
            </div>

            {detailProd.description && (
              <p className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-slate-600">
                {detailProd.description}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
              {caps.canViewPurchasePrices && (
                <button
                  type="button"
                  onClick={() => setDetailTab('batches')}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                    detailTab === 'batches'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Batch Pricing ({selectedProdBatches.length})
                </button>
              )}
              {caps.canViewPurchasePrices && (
                <button
                  type="button"
                  onClick={() => setDetailTab('purchases')}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                    detailTab === 'purchases'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Purchase History ({selectedProdPurchases.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailTab('sales')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  detailTab === 'sales'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sales & Bills ({selectedProdSales.length})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('movements')}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium ${
                  detailTab === 'movements'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Stock Ledger ({selectedProdMovements.length})
              </button>
            </div>

            {detailTab === 'batches' && caps.canViewPurchasePrices && (
              <div className="overflow-x-auto">
                {selectedProdBatches.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">
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
                          <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatINR(b.unitCost)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                            {b.initialQty}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-teal-700 tabular-nums">
                            {b.remainingQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {detailTab === 'purchases' && caps.canViewPurchasePrices && (
              <div className="overflow-x-auto">
                {selectedProdPurchases.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">No purchase entries recorded.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Invoice No</th>
                        <th className="px-3 py-2 font-medium">Supplier</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Rate</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProdPurchases.map((row) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(row.date)}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-slate-900">
                            {row.invoiceNo}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{row.supplierName}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{row.qty}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatINR(row.rate)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                            {formatINR(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {detailTab === 'sales' && (
              <div className="overflow-x-auto">
                {selectedProdSales.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">No sales or bill book entries yet.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Source / Bill No</th>
                        <th className="px-3 py-2 font-medium">Shop</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Rate</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProdSales.map((row) => (
                        <tr key={row.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(row.date)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono font-semibold text-slate-900">
                              {row.invoiceNo}
                            </span>
                            <span className="ml-1.5 text-[10px] text-slate-400">
                              ({row.source})
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{row.shopName}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{row.qty}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatINR(row.rate)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                            {formatINR(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {detailTab === 'movements' && (
              <div className="overflow-x-auto">
                {selectedProdMovements.length === 0 ? (
                  <p className="py-6 text-center text-slate-500">No stock movements logged.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Movement</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Reference / Notes</th>
                        <th className="px-3 py-2 font-medium">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedProdMovements.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {formatDateDDMMYYYY(m.date)}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-800">
                            {m.movementType.replace(/_/g, ' ').toUpperCase()}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
                              m.direction === 'in'
                                ? 'text-emerald-700'
                                : m.direction === 'out'
                                ? 'text-red-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {m.direction === 'in' ? '+' : m.direction === 'out' ? '-' : ''}
                            {m.qty}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {m.referenceNumber ? `${m.referenceNumber} · ` : ''}
                            {m.notes || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{m.createdByName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Owner-only Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={`Delete Product — ${deleteTarget?.name || ''}`}
        subtitle="Only unused products with zero transaction history can be permanently deleted."
        size="md"
      >
        {deleteTarget && (
          <div className="space-y-4 text-xs">
            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                {err}
              </div>
            )}
            <p className="text-slate-600">
              {productHasTransactions(deleteTarget.id)
                ? 'This product already has linked purchases, invoices, returns, or stock movements. Permanent deletion is blocked to preserve accounting integrity — mark it Inactive in Edit instead.'
                : `Confirm permanent deletion of "${deleteTarget.name}" (${deleteTarget.sku}). This action is recorded in the audit log.`}
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-700"
              >
                Cancel
              </button>
              {!productHasTransactions(deleteTarget.id) ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmDelete}
                  className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Confirm Delete'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const target = deleteTarget;
                    setDeleteTarget(null);
                    openEdit(target);
                  }}
                  className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800"
                >
                  Edit & Mark Inactive
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
