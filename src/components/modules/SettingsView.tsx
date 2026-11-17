import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Database, Download, Trash2, Upload } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { seedDemoData } from '../../lib/demoSeed';
import { logAudit, removeAllDemoData, saveSettings } from '../../lib/erpService';
import { db, ORG_ID } from '../../lib/firebase';
import { makeSafeId } from '../../lib/formatters';

export const SettingsView: React.FC = () => {
  const {
    profile,
    settings,
    hasDemoData,
    products,
    stockBatches,
    suppliers,
    shops,
    purchases,
    purchaseItems,
    sales,
    saleItems,
    stockMovements,
    payments,
    returns,
  } = useErp();

  const [form, setForm] = useState({
    businessName: 'Pramanik Digital Point',
    appName: 'Pramanik Stock Manager',
    location: 'Singda, Dantan, Paschim Medinipur, West Bengal 721426',
    phone: '',
    gstin: '',
    invoicePrefix: 'PDP',
    allowNegativeStock: false,
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        businessName: settings.businessName || 'Pramanik Digital Point',
        appName: settings.appName || 'Pramanik Stock Manager',
        location: settings.location || 'Singda, Dantan, Paschim Medinipur, West Bengal',
        phone: settings.phone || '',
        gstin: settings.gstin || '',
        invoicePrefix: settings.invoicePrefix || 'PDP',
        allowNegativeStock: Boolean(settings.allowNegativeStock),
      });
    }
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setStatusMsg(null);
    setErrMsg(null);
    try {
      await saveSettings(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        {
          ...form,
          lastBackupAt: settings?.lastBackupAt,
        }
      );
      setStatusMsg('Business settings saved.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportJSONBackup = async () => {
    if (!profile) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      orgId: ORG_ID,
      businessProfile: form,
      products,
      stockBatches,
      suppliers,
      shops,
      purchases,
      purchaseItems,
      sales,
      saleItems,
      stockMovements,
      payments,
      returns,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pramanik-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    await saveSettings(
      { uid: profile.uid, displayName: profile.displayName, role: profile.role },
      { ...form, lastBackupAt: new Date().toISOString() }
    );
    await logAudit(
      { uid: profile.uid, displayName: profile.displayName, role: profile.role },
      'EXPORT_BACKUP',
      'settings',
      'Downloaded full JSON database backup'
    );
    setStatusMsg('Full JSON backup downloaded.');
  };

  const handleExportExcelWorkbook = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(products), 'Products');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(suppliers), 'Suppliers');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shops), 'Shops');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchases), 'Purchases');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sales), 'Sales');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payments), 'Payments');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(returns), 'Returns');
    XLSX.writeFile(wb, `pramanik-full-workbook-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setStatusMsg('Multi-sheet Excel workbook exported.');
  };

  const handleRestoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setSaving(true);
    setErrMsg(null);
    setStatusMsg(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const restoreCols: Array<[string, Array<Record<string, unknown>>]> = [
        ['products', data.products || []],
        ['stock_batches', data.stockBatches || []],
        ['suppliers', data.suppliers || []],
        ['shops', data.shops || []],
        ['purchases', data.purchases || []],
        ['purchase_items', data.purchaseItems || []],
        ['sales', data.sales || []],
        ['sale_items', data.saleItems || []],
        ['stock_movements', data.stockMovements || []],
        ['payments', data.payments || []],
        ['returns', data.returns || []],
      ];

      let restoredCount = 0;
      const now = serverTimestamp();
      for (const [colName, docsList] of restoreCols) {
        if (!Array.isArray(docsList) || docsList.length === 0) continue;
        for (let i = 0; i < docsList.length; i += 350) {
          const batch = writeBatch(db);
          for (const raw of docsList.slice(i, i + 350)) {
            const docId = String(raw.id || makeSafeId('rst')).replace(/[^a-zA-Z0-9_-]/g, '_');
            const copy = { ...raw };
            delete copy.id;
            copy.orgId = ORG_ID;
            copy.createdAt = now;
            if ('updatedAt' in copy || !['purchase_items', 'stock_movements'].includes(colName)) {
              if (colName !== 'purchase_items' && colName !== 'stock_movements') {
                copy.updatedAt = now;
              }
            }
            copy.createdBy = profile.uid;
            batch.set(doc(db, colName, docId), copy);
            restoredCount++;
          }
          await batch.commit();
        }
      }
      await logAudit(
        { uid: profile.uid, displayName: profile.displayName, role: profile.role },
        'RESTORE_BACKUP',
        'settings',
        `Restored ${restoredCount} records from backup file`
      );
      setStatusMsg(`Restored ${restoredCount} records from backup.`);
    } catch (rstErr) {
      setErrMsg(rstErr instanceof Error ? rstErr.message : 'Restore failed.');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleSeedDemo = async () => {
    if (!profile) return;
    setSaving(true);
    setErrMsg(null);
    try {
      await seedDemoData({
        uid: profile.uid,
        displayName: profile.displayName,
        role: profile.role,
      });
      setStatusMsg('DEMO dataset loaded successfully.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to load demo data.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDemo = async () => {
    if (!profile) return;
    setSaving(true);
    setErrMsg(null);
    try {
      const count = await removeAllDemoData({
        uid: profile.uid,
        displayName: profile.displayName,
        role: profile.role,
      });
      setStatusMsg(`Removed ${count} DEMO records. Production data remains intact.`);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to remove demo data.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Business & Stock Policy */}
      <form
        onSubmit={handleSaveSettings}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 text-xs lg:col-span-7"
      >
        <h3 className="text-sm font-semibold text-slate-900">
          Business Profile & Inventory Controls
        </h3>

        {statusMsg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
            {statusMsg}
          </div>
        )}
        {errMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
            {errMsg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block font-medium text-slate-700">Business Name</label>
            <input
              type="text"
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Application Title</label>
            <input
              type="text"
              required
              value={form.appName}
              onChange={(e) => setForm({ ...form, appName: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block font-medium text-slate-700">Location Address</label>
            <input
              type="text"
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">GSTIN</label>
            <input
              type="text"
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700">Invoice Prefix</label>
            <input
              type="text"
              required
              value={form.invoicePrefix}
              onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono"
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={form.allowNegativeStock}
            onChange={(e) => setForm({ ...form, allowNegativeStock: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <strong className="block text-slate-900">
              Owner Override: Allow Negative Warehouse Stock
            </strong>
            <span className="text-[11px] text-slate-500">
              By default negative stock is blocked. Enable only when Owner authorizes dispatching stock prior to purchase entry.
            </span>
          </span>
        </label>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Business Settings'}
          </button>
        </div>
      </form>

      {/* Backup, Restore & Demo Data Controls */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-xs">
          <h3 className="text-sm font-semibold text-slate-900">Daily Backup & Restore</h3>
          <p className="mt-1 text-slate-500">
            Export a complete JSON snapshot for point-in-time restore or multi-sheet Excel archive.
            {settings?.lastBackupAt && (
              <span className="mt-1 block font-mono text-[11px] text-slate-600">
                Last backup: {settings.lastBackupAt.slice(0, 19).replace('T', ' ')} UTC
              </span>
            )}
          </p>

          <div className="mt-4 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleExportJSONBackup}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              <Download className="h-4 w-4" />
              <span>Download Full JSON Backup</span>
            </button>
            <button
              type="button"
              onClick={handleExportExcelWorkbook}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              <span>Export Complete Excel Workbook (.xlsx)</span>
            </button>

            <input
              ref={restoreRef}
              type="file"
              accept=".json"
              onChange={handleRestoreJSON}
              className="hidden"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => restoreRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              <span>Restore from JSON Backup</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 text-xs">
          <h3 className="text-sm font-semibold text-slate-900">DEMO Dataset Management</h3>
          <p className="mt-1 text-slate-500">
            Demo records are explicitly flagged with <span className="font-mono">[DEMO]</span> and
            can be safely removed without affecting real business transactions.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={handleSeedDemo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Database className="h-4 w-4" />
              <span>Load DEMO Dataset</span>
            </button>
            {hasDemoData && (
              <button
                type="button"
                disabled={saving}
                onClick={handleRemoveDemo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 font-semibold text-red-700 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" />
                <span>Remove All DEMO Data</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
