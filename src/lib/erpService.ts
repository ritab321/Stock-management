import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  OperationType,
  ORG_ID,
} from './firebase';
import {
  emailToInviteId,
  makeInvoiceNumber,
  makeSafeId,
  roundMoney,
} from './formatters';
import type {
  AppSettings,
  BillInvoice,
  BillInvoiceItem,
  BillPaymentStatus,
  DeliveryMethod,
  MovementType,
  PaymentKind,
  PaymentMethod,
  PrintFormat,
  Product,
  PurchaseType,
  ReturnType,
  Sale,
  SaleItem,
  Shop,
  StockBatch,
  Supplier,
  UserProfile,
  UserRole,
} from '../types/erp';

export interface ActorContext {
  uid: string;
  displayName: string;
  role: UserRole;
}

function cleanOptional<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

export async function logAudit(
  actor: ActorContext,
  action: string,
  module: string,
  details: string,
  entityId?: string,
  entityLabel?: string,
  isDemo = false,
  extra?: { oldValue?: string; newValue?: string; notes?: string }
): Promise<void> {
  const id = makeSafeId('aud');
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'audit_logs', id),
      cleanOptional({
        action: action.slice(0, 80),
        module: module.slice(0, 60),
        entityId: entityId?.slice(0, 128),
        entityLabel: entityLabel?.slice(0, 160),
        details: details.slice(0, 500),
        oldValue: extra?.oldValue?.slice(0, 500),
        newValue: extra?.newValue?.slice(0, 500),
        notes: extra?.notes?.slice(0, 500),
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo,
        createdAt: serverTimestamp(),
      })
    );
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `audit_logs/${id}`);
  }
}

// =========================================================
// PRODUCTS & IMPORT
// =========================================================
export async function saveProduct(
  actor: ActorContext,
  input: {
    id?: string;
    name: string;
    sku: string;
    barcode?: string;
    brand?: string;
    category: string;
    description?: string;
    imageUrl?: string;
    purchasePrice: number;
    sellingPrice: number;
    minStockAlert: number;
    availableQty: number;
    damagedQty: number;
    unit: string;
    status: 'active' | 'inactive';
    warehouseZone?: string;
  },
  isNew: boolean
): Promise<string> {
  const id = input.id || makeSafeId('prod');
  const ref = doc(db, 'products', id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const now = serverTimestamp();
      let oldSummary = '';
      if (isNew || !snap.exists()) {
        const initQty = Math.max(0, Number(input.availableQty) || 0);
        tx.set(
          ref,
          cleanOptional({
            name: input.name.trim().slice(0, 160),
            sku: input.sku.trim().slice(0, 64),
            barcode: input.barcode?.trim().slice(0, 64),
            brand: input.brand?.trim().slice(0, 80),
            category: input.category.trim().slice(0, 80),
            description: input.description?.trim().slice(0, 500),
            imageUrl: input.imageUrl?.slice(0, 80000),
            purchasePrice: roundMoney(input.purchasePrice),
            sellingPrice: roundMoney(input.sellingPrice),
            minStockAlert: Math.max(0, Number(input.minStockAlert) || 0),
            availableQty: initQty,
            damagedQty: Math.max(0, Number(input.damagedQty) || 0),
            unit: input.unit.trim().slice(0, 32),
            status: input.status,
            warehouseZone: input.warehouseZone?.trim().slice(0, 64) || 'Main Rack A',
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          })
        );
        if (initQty > 0) {
          const batchId = makeSafeId('bat');
          tx.set(doc(db, 'stock_batches', batchId), {
            productId: id,
            batchNo: `OPEN-${input.sku.trim().slice(0, 20)}`,
            unitCost: roundMoney(input.purchasePrice),
            initialQty: initQty,
            remainingQty: initQty,
            purchaseDate: new Date().toISOString().slice(0, 10),
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          });
          const movId = makeSafeId('mov');
          tx.set(doc(db, 'stock_movements', movId), {
            date: new Date().toISOString().slice(0, 10),
            productId: id,
            productName: input.name.trim().slice(0, 160),
            sku: input.sku.trim().slice(0, 64),
            qty: initQty,
            movementType: 'stock_in',
            direction: 'in',
            referenceType: 'opening_stock',
            referenceId: id,
            referenceNumber: 'OPENING',
            warehouseZone: input.warehouseZone?.trim().slice(0, 64) || 'Main Rack A',
            notes: 'Initial opening stock',
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      } else {
        const existing = snap.data() as Product;
        oldSummary = `Price ${existing.purchasePrice}/${existing.sellingPrice}, Qty ${existing.availableQty}, Status ${existing.status}`;
        tx.update(
          ref,
          cleanOptional({
            name: input.name.trim().slice(0, 160),
            sku: input.sku.trim().slice(0, 64),
            barcode: input.barcode?.trim().slice(0, 64) || '',
            brand: input.brand?.trim().slice(0, 80) || '',
            category: input.category.trim().slice(0, 80),
            description: input.description?.trim().slice(0, 500) || '',
            imageUrl: input.imageUrl !== undefined ? input.imageUrl.slice(0, 80000) : existing.imageUrl,
            purchasePrice: roundMoney(input.purchasePrice),
            sellingPrice: roundMoney(input.sellingPrice),
            minStockAlert: Math.max(0, Number(input.minStockAlert) || 0),
            availableQty: Number(input.availableQty),
            damagedQty: Math.max(0, Number(input.damagedQty) || 0),
            unit: input.unit.trim().slice(0, 32),
            status: input.status,
            warehouseZone: input.warehouseZone?.trim().slice(0, 64) || 'Main Rack A',
            updatedAt: now,
          })
        );
      }
      const newSummary = `Price ${roundMoney(input.purchasePrice)}/${roundMoney(input.sellingPrice)}, Qty ${Number(input.availableQty)}, Status ${input.status}`;
      tx.set(
        doc(db, 'audit_logs', makeSafeId('aud')),
        cleanOptional({
          action: isNew ? 'CREATE_PRODUCT' : 'UPDATE_PRODUCT',
          module: 'products',
          entityId: id,
          entityLabel: input.name.trim().slice(0, 160),
          details: `${isNew ? 'Created' : 'Updated'} product ${input.name} (${input.sku})`,
          oldValue: oldSummary || undefined,
          newValue: newSummary,
          userId: actor.uid,
          userName: actor.displayName.slice(0, 100),
          userRole: actor.role,
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
        })
      );
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `products/${id}`);
  }
}

export async function deleteProductSafe(
  actor: ActorContext,
  product: Product,
  hasTransactions: boolean
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only Owner / Super Admin can delete products.');
  }
  if (hasTransactions) {
    throw new Error(
      'This product is linked to purchases, sales, invoices, returns, or stock movements. Set status to Inactive instead of deleting.'
    );
  }
  try {
    await deleteDoc(doc(db, 'products', product.id));
    await logAudit(
      actor,
      'DELETE_PRODUCT',
      'products',
      `Deleted unused product ${product.name} (${product.sku})`,
      product.id,
      product.name,
      product.isDemo,
      { oldValue: `${product.name} (${product.sku})`, newValue: 'DELETED' }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${product.id}`);
  }
}

export async function importProductsBatch(
  actor: ActorContext,
  rows: Array<{
    name: string;
    sku: string;
    barcode?: string;
    brand?: string;
    category: string;
    purchasePrice: number;
    sellingPrice: number;
    minStockAlert: number;
    availableQty: number;
    unit: string;
  }>
): Promise<number> {
  let count = 0;
  for (const row of rows) {
    if (!row.name || !row.sku) continue;
    await saveProduct(
      actor,
      {
        ...row,
        damagedQty: 0,
        status: 'active',
        warehouseZone: 'Main Rack A',
      },
      true
    );
    count++;
  }
  return count;
}

// =========================================================
// SUPPLIERS & SHOPS
// =========================================================
export async function saveSupplier(
  actor: ActorContext,
  input: {
    id?: string;
    name: string;
    contactPerson?: string;
    phone: string;
    whatsapp?: string;
    address?: string;
    gstin?: string;
    openingBalance: number;
    status: 'active' | 'inactive';
  },
  isNew: boolean
): Promise<string> {
  const id = input.id || makeSafeId('sup');
  const ref = doc(db, 'suppliers', id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const now = serverTimestamp();
      if (isNew || !snap.exists()) {
        const open = roundMoney(input.openingBalance);
        tx.set(
          ref,
          cleanOptional({
            name: input.name.trim().slice(0, 160),
            contactPerson: input.contactPerson?.trim().slice(0, 120),
            phone: input.phone.trim().slice(0, 24),
            whatsapp: input.whatsapp?.trim().slice(0, 24),
            address: input.address?.trim().slice(0, 300),
            gstin: input.gstin?.trim().slice(0, 20),
            openingBalance: open,
            totalPurchases: 0,
            totalPayments: 0,
            totalReturns: 0,
            outstandingPayable: open,
            status: input.status,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          })
        );
      } else {
        const ex = snap.data() as Supplier;
        const newOpen = roundMoney(input.openingBalance);
        const newOutstanding = roundMoney(newOpen + ex.totalPurchases - ex.totalPayments - ex.totalReturns);
        tx.update(
          ref,
          cleanOptional({
            name: input.name.trim().slice(0, 160),
            contactPerson: input.contactPerson?.trim().slice(0, 120) || '',
            phone: input.phone.trim().slice(0, 24),
            whatsapp: input.whatsapp?.trim().slice(0, 24) || '',
            address: input.address?.trim().slice(0, 300) || '',
            gstin: input.gstin?.trim().slice(0, 20) || '',
            openingBalance: newOpen,
            outstandingPayable: newOutstanding,
            status: input.status,
            updatedAt: now,
          })
        );
      }
      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: isNew ? 'CREATE_SUPPLIER' : 'UPDATE_SUPPLIER',
        module: 'suppliers',
        entityId: id,
        entityLabel: input.name.trim().slice(0, 160),
        details: `${isNew ? 'Added' : 'Updated'} supplier ${input.name}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `suppliers/${id}`);
  }
}

export async function saveShop(
  actor: ActorContext,
  input: {
    id?: string;
    shopName: string;
    ownerName: string;
    mobile: string;
    whatsapp?: string;
    address?: string;
    villageTown: string;
    town?: string;
    blockArea: string;
    district: string;
    route?: string;
    openingBalance: number;
    creditLimit: number;
    status: 'active' | 'inactive';
  },
  isNew: boolean
): Promise<string> {
  const id = input.id || makeSafeId('shop');
  const ref = doc(db, 'shops', id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const now = serverTimestamp();
      if (isNew || !snap.exists()) {
        const open = roundMoney(input.openingBalance);
        tx.set(
          ref,
          cleanOptional({
            shopName: input.shopName.trim().slice(0, 160),
            ownerName: input.ownerName.trim().slice(0, 120),
            mobile: input.mobile.trim().slice(0, 24),
            whatsapp: input.whatsapp?.trim().slice(0, 24),
            address: input.address?.trim().slice(0, 300),
            villageTown: input.villageTown.trim().slice(0, 100),
            town: input.town?.trim().slice(0, 100),
            blockArea: input.blockArea.trim().slice(0, 100),
            district: input.district.trim().slice(0, 100),
            route: input.route?.trim().slice(0, 100),
            openingBalance: open,
            creditLimit: Math.max(0, roundMoney(input.creditLimit)),
            totalPurchases: 0,
            totalPayments: 0,
            totalReturns: 0,
            totalCreditNotes: 0,
            currentOutstanding: open,
            status: input.status,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          })
        );
      } else {
        const ex = snap.data() as Shop;
        const newOpen = roundMoney(input.openingBalance);
        const newOutstanding = roundMoney(
          newOpen + ex.totalPurchases - ex.totalPayments - ex.totalReturns - ex.totalCreditNotes
        );
        tx.update(
          ref,
          cleanOptional({
            shopName: input.shopName.trim().slice(0, 160),
            ownerName: input.ownerName.trim().slice(0, 120),
            mobile: input.mobile.trim().slice(0, 24),
            whatsapp: input.whatsapp?.trim().slice(0, 24) || '',
            address: input.address?.trim().slice(0, 300) || '',
            villageTown: input.villageTown.trim().slice(0, 100),
            town: input.town?.trim().slice(0, 100) || '',
            blockArea: input.blockArea.trim().slice(0, 100),
            district: input.district.trim().slice(0, 100),
            route: input.route?.trim().slice(0, 100) || '',
            openingBalance: newOpen,
            creditLimit: Math.max(0, roundMoney(input.creditLimit)),
            currentOutstanding: newOutstanding,
            status: input.status,
            updatedAt: now,
          })
        );
      }
      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: isNew ? 'CREATE_SHOP' : 'UPDATE_SHOP',
        module: 'shops',
        entityId: id,
        entityLabel: input.shopName.trim().slice(0, 160),
        details: `${isNew ? 'Added' : 'Updated'} shop ${input.shopName} (${input.blockArea})`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `shops/${id}`);
  }
}

// =========================================================
// PURCHASE TRANSACTION (WAREHOUSE & DIRECT-TO-SHOP)
// =========================================================
export interface PurchaseLineInput {
  productId: string;
  qty: number;
  unitRate: number;
  sellingPrice?: number; // used for direct_to_shop linked sale
}

export async function createPurchaseTransaction(
  actor: ActorContext,
  input: {
    supplierId: string;
    invoiceNumber: string;
    purchaseDate: string;
    purchaseType: PurchaseType;
    targetShopId?: string;
    items: PurchaseLineInput[];
    discount: number;
    additionalExpenses: number;
    amountPaid: number;
    paymentMethod?: PaymentMethod;
    shopPaymentReceived?: number;
    shopPaymentMethod?: PaymentMethod;
    shopDiscount?: number;
    shopTransportExpense?: number;
    notes?: string;
    invoicePrefix?: string;
  }
): Promise<{ purchaseId: string; linkedSaleId?: string }> {
  const purchaseId = makeSafeId('pur');
  const linkedSaleId = input.purchaseType === 'direct_to_shop' ? makeSafeId('sale') : undefined;
  const supRef = doc(db, 'suppliers', input.supplierId);
  const shopRef =
    input.purchaseType === 'direct_to_shop' && input.targetShopId
      ? doc(db, 'shops', input.targetShopId)
      : null;

  try {
    await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const supSnap = await tx.get(supRef);
      if (!supSnap.exists()) throw new Error('Selected supplier not found.');
      const supplier = supSnap.data() as Supplier;

      let shop: Shop | null = null;
      if (shopRef) {
        const shopSnap = await tx.get(shopRef);
        if (!shopSnap.exists()) throw new Error('Target retail shop not found.');
        shop = shopSnap.data() as Shop;
      }

      const prodSnaps = await Promise.all(
        input.items.map((item) => tx.get(doc(db, 'products', item.productId)))
      );

      // 2. COMPUTE TOTALS
      const now = serverTimestamp();
      let subtotal = 0;
      const resolvedItems = input.items.map((line, idx) => {
        const snap = prodSnaps[idx];
        if (!snap.exists()) throw new Error(`Product ${line.productId} not found.`);
        const prod = snap.data() as Product;
        const qty = Math.max(1, Number(line.qty) || 0);
        const unitRate = Math.max(0, roundMoney(line.unitRate));
        const lineTotal = roundMoney(qty * unitRate);
        subtotal = roundMoney(subtotal + lineTotal);
        return {
          productId: line.productId,
          prod,
          qty,
          unitRate,
          lineTotal,
          sellingPrice: roundMoney(line.sellingPrice ?? prod.sellingPrice),
        };
      });

      const discount = Math.max(0, roundMoney(input.discount));
      const additionalExpenses = Math.max(0, roundMoney(input.additionalExpenses));
      const totalCost = Math.max(0, roundMoney(subtotal - discount + additionalExpenses));
      const amountPaid = Math.min(totalCost, Math.max(0, roundMoney(input.amountPaid)));
      const remainingDue = roundMoney(totalCost - amountPaid);
      const purStatus: 'completed' | 'partial' = remainingDue > 0.01 ? 'partial' : 'completed';

      // 3. ALL WRITES
      tx.set(
        doc(db, 'purchases', purchaseId),
        cleanOptional({
          invoiceNumber: input.invoiceNumber.trim().slice(0, 64),
          supplierId: input.supplierId,
          supplierName: supplier.name.slice(0, 160),
          purchaseDate: input.purchaseDate,
          purchaseType: input.purchaseType,
          targetShopId: input.targetShopId,
          targetShopName: shop?.shopName.slice(0, 160),
          linkedSaleId,
          itemCount: resolvedItems.length,
          subtotal,
          discount,
          additionalExpenses,
          totalCost,
          amountPaid,
          remainingDue,
          status: purStatus,
          notes: input.notes?.trim().slice(0, 500),
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      // Supplier payment entry if paid > 0
      if (amountPaid > 0) {
        tx.set(doc(db, 'payments', makeSafeId('pay')), {
          partyType: 'supplier',
          partyId: input.supplierId,
          partyName: supplier.name.slice(0, 160),
          receiptNumber: makeInvoiceNumber('SUP-PAY'),
          paymentDate: input.purchaseDate,
          amount: amountPaid,
          method: input.paymentMethod || 'bank_transfer',
          paymentKind: remainingDue > 0 ? 'partial' : 'full',
          linkedInvoiceId: purchaseId,
          linkedInvoiceNo: input.invoiceNumber.trim().slice(0, 64),
          notes: `Payment on purchase ${input.invoiceNumber}`,
          status: 'active',
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        });
      }

      // Update Supplier Balances
      tx.update(supRef, {
        totalPurchases: roundMoney(supplier.totalPurchases + totalCost),
        totalPayments: roundMoney(supplier.totalPayments + amountPaid),
        outstandingPayable: roundMoney(supplier.outstandingPayable + remainingDue),
        updatedAt: now,
      });

      // Purchase Items + Warehouse OR Direct-to-Shop handling
      for (const item of resolvedItems) {
        tx.set(doc(db, 'purchase_items', makeSafeId('pi')), {
          purchaseId,
          productId: item.productId,
          productName: item.prod.name.slice(0, 160),
          sku: item.prod.sku.slice(0, 64),
          unit: item.prod.unit.slice(0, 32),
          qty: item.qty,
          unitRate: item.unitRate,
          lineTotal: item.lineTotal,
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          createdBy: actor.uid,
        });

        if (input.purchaseType === 'warehouse') {
          // A. WAREHOUSE PURCHASE: increase stock, create batch, log stock_in
          tx.update(doc(db, 'products', item.productId), {
            availableQty: roundMoney(item.prod.availableQty + item.qty),
            purchasePrice: item.unitRate,
            updatedAt: now,
          });
          tx.set(doc(db, 'stock_batches', makeSafeId('bat')), {
            productId: item.productId,
            purchaseId,
            batchNo: `B-${input.invoiceNumber.trim().slice(0, 24)}`,
            supplierId: input.supplierId,
            unitCost: item.unitRate,
            initialQty: item.qty,
            remainingQty: item.qty,
            purchaseDate: input.purchaseDate,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          });
          tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
            date: input.purchaseDate,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            sku: item.prod.sku.slice(0, 64),
            qty: item.qty,
            movementType: 'stock_in',
            direction: 'in',
            referenceType: 'purchase',
            referenceId: purchaseId,
            referenceNumber: input.invoiceNumber.trim().slice(0, 64),
            warehouseZone: item.prod.warehouseZone || 'Main Rack A',
            notes: `Warehouse purchase from ${supplier.name}`,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      // B. DIRECT-TO-SHOP PURCHASE: create linked Sale WITHOUT touching warehouse stock!
      if (input.purchaseType === 'direct_to_shop' && linkedSaleId && shopRef && shop) {
        const saleInvoiceNo = makeInvoiceNumber(input.invoicePrefix || 'PDP-DIR');
        let saleSubtotal = 0;
        for (const item of resolvedItems) {
          saleSubtotal = roundMoney(saleSubtotal + item.qty * item.sellingPrice);
        }
        const shopDiscount = Math.max(0, roundMoney(input.shopDiscount || 0));
        const shopTransport = Math.max(0, roundMoney(input.shopTransportExpense || 0));
        const netTotal = Math.max(0, roundMoney(saleSubtotal - shopDiscount + shopTransport));
        const grossProfit = roundMoney(netTotal - totalCost);
        const shopPaid = Math.min(netTotal, Math.max(0, roundMoney(input.shopPaymentReceived || 0)));
        const shopDue = roundMoney(netTotal - shopPaid);

        tx.set(
          doc(db, 'sales', linkedSaleId),
          cleanOptional({
            invoiceNumber: saleInvoiceNo,
            deliveryMethod: 'direct_supplier_dispatch',
            shopId: input.targetShopId,
            shopName: shop.shopName.slice(0, 160),
            shopBlock: shop.blockArea.slice(0, 100),
            shopDistrict: shop.district.slice(0, 100),
            supplierId: input.supplierId,
            supplierName: supplier.name.slice(0, 160),
            supplierInvoiceNo: input.invoiceNumber.trim().slice(0, 64),
            linkedPurchaseId: purchaseId,
            saleDate: input.purchaseDate,
            deliveryStatus: 'delivered',
            itemCount: resolvedItems.length,
            subtotal: saleSubtotal,
            discount: shopDiscount,
            transportExpense: shopTransport,
            netTotal,
            totalCost,
            grossProfit,
            paymentReceived: shopPaid,
            remainingDue: shopDue,
            notes: input.notes?.trim().slice(0, 500) || `Direct delivery via ${supplier.name}`,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          })
        );

        for (const item of resolvedItems) {
          const lineTotal = roundMoney(item.qty * item.sellingPrice);
          const lineCost = roundMoney(item.qty * item.unitRate);
          tx.set(doc(db, 'sale_items', makeSafeId('si')), {
            saleId: linkedSaleId,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            sku: item.prod.sku.slice(0, 64),
            unit: item.prod.unit.slice(0, 32),
            orderedQty: item.qty,
            deliveredQty: item.qty,
            unitCost: item.unitRate,
            sellingPrice: item.sellingPrice,
            lineTotal,
            lineCost,
            lineProfit: roundMoney(lineTotal - lineCost),
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          });
        }

        if (shopPaid > 0) {
          tx.set(doc(db, 'payments', makeSafeId('pay')), {
            partyType: 'shop',
            partyId: input.targetShopId!,
            partyName: shop.shopName.slice(0, 160),
            receiptNumber: makeInvoiceNumber('RCPT'),
            paymentDate: input.purchaseDate,
            amount: shopPaid,
            method: input.shopPaymentMethod || 'cash',
            paymentKind: shopDue > 0 ? 'partial' : 'full',
            linkedInvoiceId: linkedSaleId,
            linkedInvoiceNo: saleInvoiceNo,
            notes: `Payment on direct delivery ${saleInvoiceNo}`,
            status: 'active',
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }

        tx.update(shopRef, {
          totalPurchases: roundMoney(shop.totalPurchases + netTotal),
          totalPayments: roundMoney(shop.totalPayments + shopPaid),
          currentOutstanding: roundMoney(shop.currentOutstanding + shopDue),
          lastDeliveryDate: input.purchaseDate,
          updatedAt: now,
        });
      }

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: input.purchaseType === 'warehouse' ? 'WAREHOUSE_PURCHASE' : 'DIRECT_TO_SHOP_PURCHASE',
        module: 'purchases',
        entityId: purchaseId,
        entityLabel: input.invoiceNumber.trim().slice(0, 160),
        details: `Recorded ${input.purchaseType} purchase from ${supplier.name} (${totalCost} INR)`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });

    return { purchaseId, linkedSaleId };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `purchases/${purchaseId}`);
  }
}

// =========================================================
// SALES & DELIVERY (WAREHOUSE DISPATCH & DIRECT SUPPLIER)
// =========================================================
export interface SaleLineInput {
  productId: string;
  orderedQty: number;
  deliveredQty: number;
  sellingPrice: number;
  directUnitCost?: number; // required for direct_supplier_dispatch
}

export async function createSaleTransaction(
  actor: ActorContext,
  input: {
    deliveryMethod: DeliveryMethod;
    shopId: string;
    supplierId?: string;
    supplierInvoiceNo?: string;
    supplierAmountPaid?: number;
    supplierPaymentMethod?: PaymentMethod;
    saleDate: string;
    items: SaleLineInput[];
    discount: number;
    transportExpense: number;
    paymentReceived: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    invoicePrefix?: string;
    allowNegativeStock: boolean;
  },
  allBatches: StockBatch[]
): Promise<string> {
  const saleId = makeSafeId('sale');
  const invoiceNumber = makeInvoiceNumber(
    input.invoicePrefix || (input.deliveryMethod === 'warehouse_dispatch' ? 'PDP-INV' : 'PDP-DIR')
  );
  const shopRef = doc(db, 'shops', input.shopId);
  const supRef =
    input.deliveryMethod === 'direct_supplier_dispatch' && input.supplierId
      ? doc(db, 'suppliers', input.supplierId)
      : null;
  const linkedPurchaseId =
    input.deliveryMethod === 'direct_supplier_dispatch' ? makeSafeId('pur') : undefined;

  try {
    await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const shopSnap = await tx.get(shopRef);
      if (!shopSnap.exists()) throw new Error('Selected shop not found.');
      const shop = shopSnap.data() as Shop;

      let supplier: Supplier | null = null;
      if (supRef) {
        const supSnap = await tx.get(supRef);
        if (!supSnap.exists()) throw new Error('Selected supplier not found.');
        supplier = supSnap.data() as Supplier;
      }

      const prodSnaps = await Promise.all(
        input.items.map((item) => tx.get(doc(db, 'products', item.productId)))
      );

      // Prepare batch reads if warehouse_dispatch
      const candidateBatchesByProd = new Map<string, StockBatch[]>();
      const batchSnapsMap = new Map<string, DocumentData>();
      if (input.deliveryMethod === 'warehouse_dispatch') {
        const batchRefsToRead: Array<{ id: string; ref: DocumentReference }> = [];
        for (const item of input.items) {
          const prodBatches = allBatches
            .filter((b) => b.productId === item.productId && b.remainingQty > 0)
            .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
          candidateBatchesByProd.set(item.productId, prodBatches);
          for (const b of prodBatches) {
            batchRefsToRead.push({ id: b.id, ref: doc(db, 'stock_batches', b.id) });
          }
        }
        const batchSnaps = await Promise.all(batchRefsToRead.map((b) => tx.get(b.ref)));
        batchSnaps.forEach((snap, idx) => {
          if (snap.exists()) {
            batchSnapsMap.set(batchRefsToRead[idx].id, snap.data() as StockBatch);
          }
        });
      }

      // 2. VALIDATIONS & CALCULATIONS
      const now = serverTimestamp();
      let subtotal = 0;
      let totalCost = 0;
      let allDelivered = true;
      let anyDelivered = false;
      const batchUpdates: Array<{ id: string; newRemaining: number }> = [];

      const computedItems = input.items.map((line, idx) => {
        const snap = prodSnaps[idx];
        if (!snap.exists()) throw new Error(`Product ${line.productId} not found.`);
        const prod = snap.data() as Product;
        const orderedQty = Math.max(1, Number(line.orderedQty) || 0);
        const deliveredQty = Math.min(orderedQty, Math.max(0, Number(line.deliveredQty) || 0));
        if (deliveredQty < orderedQty) allDelivered = false;
        if (deliveredQty > 0) anyDelivered = true;

        const sellingPrice = Math.max(0, roundMoney(line.sellingPrice));
        const lineTotal = roundMoney(orderedQty * sellingPrice);
        subtotal = roundMoney(subtotal + lineTotal);

        let unitCost = roundMoney(prod.purchasePrice);
        let lineCost = 0;

        if (input.deliveryMethod === 'warehouse_dispatch') {
          if (deliveredQty > 0 && prod.availableQty < deliveredQty) {
            if (!(input.allowNegativeStock && actor.role === 'owner')) {
              throw new Error(
                `Insufficient warehouse stock for ${prod.name}. Available: ${prod.availableQty}, Requested: ${deliveredQty}.`
              );
            }
          }
          // FIFO batch cost calculation for orderedQty (delivered deducted from batches)
          let remainingToCost = deliveredQty;
          const prodBatches = candidateBatchesByProd.get(line.productId) || [];
          for (const b of prodBatches) {
            if (remainingToCost <= 0) break;
            const liveBatch = (batchSnapsMap.get(b.id) as StockBatch | undefined) || b;
            if (liveBatch.remainingQty <= 0) continue;
            const take = Math.min(remainingToCost, liveBatch.remainingQty);
            lineCost = roundMoney(lineCost + take * liveBatch.unitCost);
            remainingToCost -= take;
            batchUpdates.push({ id: b.id, newRemaining: roundMoney(liveBatch.remainingQty - take) });
          }
          // For any remaining unbatched or pending qty, value at product purchasePrice
          const uncostedQty = orderedQty - (deliveredQty - remainingToCost);
          if (uncostedQty > 0) {
            lineCost = roundMoney(lineCost + uncostedQty * prod.purchasePrice);
          }
          unitCost = orderedQty > 0 ? roundMoney(lineCost / orderedQty) : prod.purchasePrice;
        } else {
          // Direct supplier dispatch: cost is supplier rate entered on dispatch
          unitCost = Math.max(0, roundMoney(line.directUnitCost ?? prod.purchasePrice));
          lineCost = roundMoney(orderedQty * unitCost);
        }

        totalCost = roundMoney(totalCost + lineCost);
        return {
          productId: line.productId,
          prod,
          orderedQty,
          deliveredQty,
          unitCost,
          sellingPrice,
          lineTotal,
          lineCost,
          lineProfit: roundMoney(lineTotal - lineCost),
        };
      });

      const discount = Math.max(0, roundMoney(input.discount));
      const transportExpense = Math.max(0, roundMoney(input.transportExpense));
      const netTotal = Math.max(0, roundMoney(subtotal - discount + transportExpense));
      const grossProfit = roundMoney(netTotal - discount * 0 - totalCost); // Net Sales Revenue - COGS (transportExpense billed to customer or separate; netTotal = subtotal - discount + transportExpense)
      const paymentReceived = Math.min(netTotal, Math.max(0, roundMoney(input.paymentReceived)));
      const remainingDue = roundMoney(netTotal - paymentReceived);
      const deliveryStatus = allDelivered ? 'delivered' : anyDelivered ? 'partial' : 'pending';

      // 3. ALL WRITES
      tx.set(
        doc(db, 'sales', saleId),
        cleanOptional({
          invoiceNumber,
          deliveryMethod: input.deliveryMethod,
          shopId: input.shopId,
          shopName: shop.shopName.slice(0, 160),
          shopBlock: shop.blockArea.slice(0, 100),
          shopDistrict: shop.district.slice(0, 100),
          supplierId: input.supplierId,
          supplierName: supplier?.name.slice(0, 160),
          supplierInvoiceNo: input.supplierInvoiceNo?.trim().slice(0, 64),
          linkedPurchaseId,
          saleDate: input.saleDate,
          deliveryStatus,
          itemCount: computedItems.length,
          subtotal,
          discount,
          transportExpense,
          netTotal,
          totalCost,
          grossProfit,
          paymentReceived,
          remainingDue,
          notes: input.notes?.trim().slice(0, 500),
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      for (const item of computedItems) {
        tx.set(doc(db, 'sale_items', makeSafeId('si')), {
          saleId,
          productId: item.productId,
          productName: item.prod.name.slice(0, 160),
          sku: item.prod.sku.slice(0, 64),
          unit: item.prod.unit.slice(0, 32),
          orderedQty: item.orderedQty,
          deliveredQty: item.deliveredQty,
          unitCost: item.unitCost,
          sellingPrice: item.sellingPrice,
          lineTotal: item.lineTotal,
          lineCost: item.lineCost,
          lineProfit: item.lineProfit,
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
        });

        if (input.deliveryMethod === 'warehouse_dispatch' && item.deliveredQty > 0) {
          tx.update(doc(db, 'products', item.productId), {
            availableQty: roundMoney(item.prod.availableQty - item.deliveredQty),
            updatedAt: now,
          });
          tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
            date: input.saleDate,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            sku: item.prod.sku.slice(0, 64),
            qty: item.deliveredQty,
            movementType: 'stock_out',
            direction: 'out',
            referenceType: 'sale',
            referenceId: saleId,
            referenceNumber: invoiceNumber,
            warehouseZone: item.prod.warehouseZone || 'Main Rack A',
            notes: `Dispatched to ${shop.shopName}`,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      // Deduct consumed FIFO stock batches
      for (const bu of batchUpdates) {
        tx.update(doc(db, 'stock_batches', bu.id), {
          remainingQty: bu.newRemaining,
          updatedAt: now,
        });
      }

      // Update Shop Balances
      tx.update(shopRef, {
        totalPurchases: roundMoney(shop.totalPurchases + netTotal),
        totalPayments: roundMoney(shop.totalPayments + paymentReceived),
        currentOutstanding: roundMoney(shop.currentOutstanding + remainingDue),
        lastDeliveryDate: input.saleDate,
        updatedAt: now,
      });

      // Record Shop Payment if received > 0
      if (paymentReceived > 0) {
        tx.set(doc(db, 'payments', makeSafeId('pay')), {
          partyType: 'shop',
          partyId: input.shopId,
          partyName: shop.shopName.slice(0, 160),
          receiptNumber: makeInvoiceNumber('RCPT'),
          paymentDate: input.saleDate,
          amount: paymentReceived,
          method: input.paymentMethod,
          paymentKind: remainingDue > 0 ? 'partial' : 'full',
          linkedInvoiceId: saleId,
          linkedInvoiceNo: invoiceNumber,
          notes: `Payment on invoice ${invoiceNumber}`,
          status: 'active',
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        });
      }

      // If Direct Supplier Dispatch, record linked Purchase & Supplier payable (NEVER touch warehouse stock!)
      if (input.deliveryMethod === 'direct_supplier_dispatch' && supRef && supplier && linkedPurchaseId) {
        const supInvoice = input.supplierInvoiceNo?.trim() || makeInvoiceNumber('SUP-DIR');
        const supPaid = Math.min(totalCost, Math.max(0, roundMoney(input.supplierAmountPaid || 0)));
        const supDue = roundMoney(totalCost - supPaid);

        tx.set(
          doc(db, 'purchases', linkedPurchaseId),
          cleanOptional({
            invoiceNumber: supInvoice.slice(0, 64),
            supplierId: input.supplierId,
            supplierName: supplier.name.slice(0, 160),
            purchaseDate: input.saleDate,
            purchaseType: 'direct_to_shop',
            targetShopId: input.shopId,
            targetShopName: shop.shopName.slice(0, 160),
            linkedSaleId: saleId,
            itemCount: computedItems.length,
            subtotal: totalCost,
            discount: 0,
            additionalExpenses: 0,
            totalCost,
            amountPaid: supPaid,
            remainingDue: supDue,
            status: supDue > 0.01 ? 'partial' : 'completed',
            notes: `Linked to Direct Dispatch ${invoiceNumber}`,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          })
        );

        for (const item of computedItems) {
          tx.set(doc(db, 'purchase_items', makeSafeId('pi')), {
            purchaseId: linkedPurchaseId,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            sku: item.prod.sku.slice(0, 64),
            unit: item.prod.unit.slice(0, 32),
            qty: item.orderedQty,
            unitRate: item.unitCost,
            lineTotal: item.lineCost,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            createdBy: actor.uid,
          });
        }

        tx.update(supRef, {
          totalPurchases: roundMoney(supplier.totalPurchases + totalCost),
          totalPayments: roundMoney(supplier.totalPayments + supPaid),
          outstandingPayable: roundMoney(supplier.outstandingPayable + supDue),
          updatedAt: now,
        });

        if (supPaid > 0) {
          tx.set(doc(db, 'payments', makeSafeId('pay')), {
            partyType: 'supplier',
            partyId: input.supplierId!,
            partyName: supplier.name.slice(0, 160),
            receiptNumber: makeInvoiceNumber('SUP-PAY'),
            paymentDate: input.saleDate,
            amount: supPaid,
            method: input.supplierPaymentMethod || 'bank_transfer',
            paymentKind: supDue > 0 ? 'partial' : 'full',
            linkedInvoiceId: linkedPurchaseId,
            linkedInvoiceNo: supInvoice.slice(0, 64),
            notes: `Supplier payment on direct dispatch ${invoiceNumber}`,
            status: 'active',
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action:
          input.deliveryMethod === 'warehouse_dispatch'
            ? 'WAREHOUSE_DISPATCH'
            : 'DIRECT_SUPPLIER_DISPATCH',
        module: 'sales',
        entityId: saleId,
        entityLabel: invoiceNumber,
        details: `Created ${invoiceNumber} for ${shop.shopName} (${netTotal} INR)`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });

    return saleId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `sales/${saleId}`);
  }
}

export async function completePartialDelivery(
  actor: ActorContext,
  sale: Sale,
  items: SaleItem[],
  allowNegativeStock: boolean
): Promise<void> {
  const saleRef = doc(db, 'sales', sale.id);
  try {
    await runTransaction(db, async (tx) => {
      const saleSnap = await tx.get(saleRef);
      if (!saleSnap.exists()) throw new Error('Invoice not found.');
      const prodSnaps = await Promise.all(
        items.map((it) => tx.get(doc(db, 'products', it.productId)))
      );

      const now = serverTimestamp();
      const today = new Date().toISOString().slice(0, 10);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const remainingQty = it.orderedQty - it.deliveredQty;
        if (remainingQty <= 0) continue;

        if (sale.deliveryMethod === 'warehouse_dispatch') {
          const prodSnap = prodSnaps[i];
          if (!prodSnap.exists()) throw new Error(`Product ${it.productName} missing.`);
          const prod = prodSnap.data() as Product;
          if (prod.availableQty < remainingQty && !(allowNegativeStock && actor.role === 'owner')) {
            throw new Error(
              `Insufficient warehouse stock for ${prod.name}. Available: ${prod.availableQty}, Remaining to deliver: ${remainingQty}.`
            );
          }
          tx.update(doc(db, 'products', it.productId), {
            availableQty: roundMoney(prod.availableQty - remainingQty),
            updatedAt: now,
          });
          tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
            date: today,
            productId: it.productId,
            productName: it.productName.slice(0, 160),
            sku: it.sku.slice(0, 64),
            qty: remainingQty,
            movementType: 'stock_out',
            direction: 'out',
            referenceType: 'sale_completion',
            referenceId: sale.id,
            referenceNumber: sale.invoiceNumber,
            warehouseZone: prod.warehouseZone || 'Main Rack A',
            notes: `Completed remaining delivery for ${sale.shopName}`,
            orgId: ORG_ID,
            isDemo: sale.isDemo,
            createdAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }

        tx.update(doc(db, 'sale_items', it.id), {
          deliveredQty: it.orderedQty,
          updatedAt: now,
        });
      }

      tx.update(saleRef, {
        deliveryStatus: 'delivered',
        updatedAt: now,
      });

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: 'COMPLETE_DELIVERY',
        module: 'sales',
        entityId: sale.id,
        entityLabel: sale.invoiceNumber,
        details: `Completed remaining delivery for ${sale.invoiceNumber}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: sale.isDemo,
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `sales/${sale.id}`);
  }
}

// =========================================================
// WAREHOUSE STOCK ADJUSTMENTS / TRANSFERS / VERIFICATION
// =========================================================
export async function recordWarehouseOperation(
  actor: ActorContext,
  input: {
    productId: string;
    date: string;
    movementType: MovementType;
    qty: number; // for verification, pass physicalCountedQty
    warehouseZone?: string;
    notes: string;
    allowNegativeStock: boolean;
  }
): Promise<void> {
  const prodRef = doc(db, 'products', input.productId);
  const movId = makeSafeId('mov');
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(prodRef);
      if (!snap.exists()) throw new Error('Product not found.');
      const prod = snap.data() as Product;
      const now = serverTimestamp();

      let newAvailable = prod.availableQty;
      let newDamaged = prod.damagedQty;
      let direction: 'in' | 'out' | 'neutral' = 'neutral';
      let loggedQty = Math.abs(Number(input.qty) || 0);
      let zone = input.warehouseZone?.trim() || prod.warehouseZone || 'Main Rack A';

      if (input.movementType === 'stock_in') {
        newAvailable = roundMoney(prod.availableQty + loggedQty);
        direction = 'in';
      } else if (input.movementType === 'stock_out') {
        newAvailable = roundMoney(prod.availableQty - loggedQty);
        direction = 'out';
      } else if (input.movementType === 'adjustment') {
        // qty can be positive or negative signed
        const signed = Number(input.qty) || 0;
        newAvailable = roundMoney(prod.availableQty + signed);
        direction = signed >= 0 ? 'in' : 'out';
        loggedQty = Math.abs(signed);
      } else if (input.movementType === 'damaged') {
        newAvailable = roundMoney(prod.availableQty - loggedQty);
        newDamaged = roundMoney(prod.damagedQty + loggedQty);
        direction = 'out';
      } else if (input.movementType === 'transfer') {
        direction = 'neutral';
      } else if (input.movementType === 'verification') {
        const physicalCount = Math.max(0, Number(input.qty) || 0);
        const variance = roundMoney(physicalCount - prod.availableQty);
        newAvailable = physicalCount;
        direction = variance > 0 ? 'in' : variance < 0 ? 'out' : 'neutral';
        loggedQty = Math.abs(variance);
      }

      if (newAvailable < 0 && !(input.allowNegativeStock && actor.role === 'owner')) {
        throw new Error(
          `Negative stock prevented for ${prod.name}. Current: ${prod.availableQty}. Only Owner can authorize negative stock.`
        );
      }

      tx.update(prodRef, {
        availableQty: newAvailable,
        damagedQty: newDamaged,
        warehouseZone: zone,
        updatedAt: now,
      });

      tx.set(
        doc(db, 'stock_movements', movId),
        cleanOptional({
          date: input.date,
          productId: input.productId,
          productName: prod.name.slice(0, 160),
          sku: prod.sku.slice(0, 64),
          qty: loggedQty,
          movementType: input.movementType,
          direction,
          referenceType: 'warehouse_op',
          referenceNumber: input.movementType.toUpperCase(),
          warehouseZone: zone,
          notes: input.notes.trim().slice(0, 500),
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: `STOCK_${input.movementType.toUpperCase()}`,
        module: 'warehouse',
        entityId: input.productId,
        entityLabel: prod.name.slice(0, 160),
        details: `${input.movementType} on ${prod.name}: qty ${loggedQty} (${input.notes})`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `products/${input.productId}`);
  }
}

// =========================================================
// PAYMENTS (SHOP & SUPPLIER) + AUTHORIZED REVERSAL
// =========================================================
export async function recordPaymentTransaction(
  actor: ActorContext,
  input: {
    partyType: 'shop' | 'supplier';
    partyId: string;
    paymentDate: string;
    amount: number;
    method: PaymentMethod;
    paymentKind: PaymentKind;
    referenceNo?: string;
    linkedInvoiceId?: string;
    notes?: string;
  }
): Promise<string> {
  const payId = makeSafeId('pay');
  const partyRef = doc(db, input.partyType === 'shop' ? 'shops' : 'suppliers', input.partyId);
  const linkedRef = input.linkedInvoiceId
    ? doc(db, input.partyType === 'shop' ? 'sales' : 'purchases', input.linkedInvoiceId)
    : null;

  try {
    await runTransaction(db, async (tx) => {
      const partySnap = await tx.get(partyRef);
      if (!partySnap.exists()) throw new Error('Account party not found.');
      const linkedSnap = linkedRef ? await tx.get(linkedRef) : null;

      const amount = Math.max(0.01, roundMoney(input.amount));
      const now = serverTimestamp();
      const receiptNumber = makeInvoiceNumber(input.partyType === 'shop' ? 'RCPT' : 'SUP-PAY');
      let partyName = '';
      let linkedInvoiceNo: string | undefined;

      if (input.partyType === 'shop') {
        const shop = partySnap.data() as Shop;
        partyName = shop.shopName;
        // Refund increases outstanding (returning cash to customer); payment/advance/credit_note reduces outstanding
        const delta = input.paymentKind === 'refund' ? amount : -amount;
        const isCreditNote = input.paymentKind === 'credit_note';
        tx.update(partyRef, {
          totalPayments: isCreditNote
            ? shop.totalPayments
            : roundMoney(shop.totalPayments + (input.paymentKind === 'refund' ? -amount : amount)),
          totalCreditNotes: isCreditNote
            ? roundMoney(shop.totalCreditNotes + amount)
            : shop.totalCreditNotes,
          currentOutstanding: roundMoney(shop.currentOutstanding + delta),
          updatedAt: now,
        });

        if (linkedSnap && linkedSnap.exists()) {
          const sale = linkedSnap.data() as Sale;
          linkedInvoiceNo = sale.invoiceNumber;
          if (input.paymentKind !== 'refund') {
            const newPaid = roundMoney(sale.paymentReceived + amount);
            tx.update(linkedRef!, {
              paymentReceived: newPaid,
              remainingDue: roundMoney(sale.netTotal - newPaid),
              updatedAt: now,
            });
          }
        }
      } else {
        const sup = partySnap.data() as Supplier;
        partyName = sup.name;
        const delta = input.paymentKind === 'refund' ? amount : -amount;
        tx.update(partyRef, {
          totalPayments: roundMoney(sup.totalPayments + (input.paymentKind === 'refund' ? -amount : amount)),
          outstandingPayable: roundMoney(sup.outstandingPayable + delta),
          updatedAt: now,
        });

        if (linkedSnap && linkedSnap.exists()) {
          const pur = linkedSnap.data();
          linkedInvoiceNo = String(pur.invoiceNumber);
          const newPaid = roundMoney((Number(pur.amountPaid) || 0) + amount);
          const newDue = roundMoney((Number(pur.totalCost) || 0) - newPaid);
          tx.update(linkedRef!, {
            amountPaid: newPaid,
            remainingDue: newDue,
            status: newDue <= 0.01 ? 'completed' : 'partial',
            updatedAt: now,
          });
        }
      }

      tx.set(
        doc(db, 'payments', payId),
        cleanOptional({
          partyType: input.partyType,
          partyId: input.partyId,
          partyName: partyName.slice(0, 160),
          receiptNumber,
          paymentDate: input.paymentDate,
          amount,
          method: input.method,
          paymentKind: input.paymentKind,
          referenceNo: input.referenceNo?.trim().slice(0, 80),
          linkedInvoiceId: input.linkedInvoiceId,
          linkedInvoiceNo,
          notes: input.notes?.trim().slice(0, 500),
          status: 'active',
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: input.partyType === 'shop' ? 'SHOP_PAYMENT' : 'SUPPLIER_PAYMENT',
        module: 'payments',
        entityId: payId,
        entityLabel: receiptNumber,
        details: `Recorded ${input.paymentKind} (${input.method}) of ${amount} INR for ${partyName}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });

    return payId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `payments/${payId}`);
  }
}

export async function reversePaymentTransaction(
  actor: ActorContext,
  paymentId: string,
  reason: string
): Promise<void> {
  const payRef = doc(db, 'payments', paymentId);
  try {
    await runTransaction(db, async (tx) => {
      const paySnap = await tx.get(payRef);
      if (!paySnap.exists()) throw new Error('Payment record not found.');
      const pay = paySnap.data();
      if (pay.status === 'reversed') throw new Error('Payment is already reversed.');

      const partyRef = doc(db, pay.partyType === 'shop' ? 'shops' : 'suppliers', pay.partyId);
      const partySnap = await tx.get(partyRef);
      const linkedRef = pay.linkedInvoiceId
        ? doc(db, pay.partyType === 'shop' ? 'sales' : 'purchases', pay.linkedInvoiceId)
        : null;
      const linkedSnap = linkedRef ? await tx.get(linkedRef) : null;

      const now = serverTimestamp();
      const amount = Number(pay.amount) || 0;

      if (partySnap.exists()) {
        if (pay.partyType === 'shop') {
          const shop = partySnap.data() as Shop;
          const isCreditNote = pay.paymentKind === 'credit_note';
          const delta = pay.paymentKind === 'refund' ? -amount : amount;
          tx.update(partyRef, {
            totalPayments: isCreditNote
              ? shop.totalPayments
              : roundMoney(shop.totalPayments - (pay.paymentKind === 'refund' ? -amount : amount)),
            totalCreditNotes: isCreditNote
              ? roundMoney(shop.totalCreditNotes - amount)
              : shop.totalCreditNotes,
            currentOutstanding: roundMoney(shop.currentOutstanding + delta),
            updatedAt: now,
          });
        } else {
          const sup = partySnap.data() as Supplier;
          const delta = pay.paymentKind === 'refund' ? -amount : amount;
          tx.update(partyRef, {
            totalPayments: roundMoney(sup.totalPayments - (pay.paymentKind === 'refund' ? -amount : amount)),
            outstandingPayable: roundMoney(sup.outstandingPayable + delta),
            updatedAt: now,
          });
        }
      }

      if (linkedSnap && linkedSnap.exists()) {
        const inv = linkedSnap.data();
        if (pay.partyType === 'shop') {
          const newPaid = Math.max(0, roundMoney((Number(inv.paymentReceived) || 0) - amount));
          tx.update(linkedRef!, {
            paymentReceived: newPaid,
            remainingDue: roundMoney((Number(inv.netTotal) || 0) - newPaid),
            updatedAt: now,
          });
        } else {
          const newPaid = Math.max(0, roundMoney((Number(inv.amountPaid) || 0) - amount));
          const newDue = roundMoney((Number(inv.totalCost) || 0) - newPaid);
          tx.update(linkedRef!, {
            amountPaid: newPaid,
            remainingDue: newDue,
            status: newDue <= 0.01 ? 'completed' : 'partial',
            updatedAt: now,
          });
        }
      }

      tx.update(payRef, {
        status: 'reversed',
        reversalReason: reason.trim().slice(0, 300),
        reversedBy: actor.uid,
        updatedAt: now,
      });

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: 'REVERSE_PAYMENT',
        module: 'payments',
        entityId: paymentId,
        entityLabel: String(pay.receiptNumber),
        details: `Reversed ${pay.receiptNumber} (${amount} INR). Reason: ${reason}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: Boolean(pay.isDemo),
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payments/${paymentId}`);
  }
}

// =========================================================
// RETURNS & DAMAGED GOODS
// =========================================================
export async function createReturnTransaction(
  actor: ActorContext,
  input: {
    returnType: ReturnType;
    returnDate: string;
    partyId?: string;
    productId: string;
    qty: number;
    unitValue: number;
    condition: 'good_sellable' | 'damaged';
    reason: string;
    linkedInvoiceNo?: string;
    allowNegativeStock: boolean;
  }
): Promise<string> {
  const retId = makeSafeId('ret');
  const returnNumber = makeInvoiceNumber('RET');
  const prodRef = doc(db, 'products', input.productId);
  const partyType: 'shop' | 'supplier' | 'internal' =
    input.returnType === 'shop_return' || input.returnType === 'replacement'
      ? 'shop'
      : input.returnType === 'supplier_return'
      ? 'supplier'
      : 'internal';
  const partyRef =
    input.partyId && partyType !== 'internal'
      ? doc(db, partyType === 'shop' ? 'shops' : 'suppliers', input.partyId)
      : null;

  try {
    await runTransaction(db, async (tx) => {
      const prodSnap = await tx.get(prodRef);
      if (!prodSnap.exists()) throw new Error('Product not found.');
      const prod = prodSnap.data() as Product;
      const partySnap = partyRef ? await tx.get(partyRef) : null;

      const qty = Math.max(1, Number(input.qty) || 0);
      const unitValue = Math.max(0, roundMoney(input.unitValue));
      const totalValue = roundMoney(qty * unitValue);
      const now = serverTimestamp();

      let newAvailable = prod.availableQty;
      let newDamaged = prod.damagedQty;
      let returnedToStock = false;
      let movType: MovementType = 'adjustment';
      let movDir: 'in' | 'out' | 'neutral' = 'neutral';
      let partyName: string | undefined;

      if (input.returnType === 'shop_return') {
        if (input.condition === 'good_sellable') {
          newAvailable = roundMoney(prod.availableQty + qty);
          returnedToStock = true;
          movType = 'shop_return';
          movDir = 'in';
        } else {
          newDamaged = roundMoney(prod.damagedQty + qty);
          returnedToStock = false;
          movType = 'damaged';
          movDir = 'neutral';
        }
        if (partySnap && partySnap.exists()) {
          const shop = partySnap.data() as Shop;
          partyName = shop.shopName;
          tx.update(partyRef!, {
            totalReturns: roundMoney(shop.totalReturns + totalValue),
            currentOutstanding: roundMoney(shop.currentOutstanding - totalValue),
            updatedAt: now,
          });
        }
      } else if (input.returnType === 'supplier_return') {
        if (input.condition === 'damaged' && prod.damagedQty >= qty) {
          newDamaged = roundMoney(prod.damagedQty - qty);
        } else {
          newAvailable = roundMoney(prod.availableQty - qty);
          if (newAvailable < 0 && !(input.allowNegativeStock && actor.role === 'owner')) {
            throw new Error(`Insufficient stock to return ${qty} of ${prod.name} to supplier.`);
          }
        }
        movType = 'supplier_return';
        movDir = 'out';
        if (partySnap && partySnap.exists()) {
          const sup = partySnap.data() as Supplier;
          partyName = sup.name;
          tx.update(partyRef!, {
            totalReturns: roundMoney(sup.totalReturns + totalValue),
            outstandingPayable: roundMoney(sup.outstandingPayable - totalValue),
            updatedAt: now,
          });
        }
      } else if (input.returnType === 'damaged_writeoff') {
        newAvailable = roundMoney(prod.availableQty - qty);
        if (newAvailable < 0 && !(input.allowNegativeStock && actor.role === 'owner')) {
          throw new Error(`Insufficient stock for damaged write-off of ${prod.name}.`);
        }
        newDamaged = roundMoney(prod.damagedQty + qty);
        movType = 'damaged';
        movDir = 'out';
      } else if (input.returnType === 'replacement') {
        newAvailable = roundMoney(prod.availableQty - qty);
        if (newAvailable < 0 && !(input.allowNegativeStock && actor.role === 'owner')) {
          throw new Error(`Insufficient stock to issue replacement for ${prod.name}.`);
        }
        newDamaged = roundMoney(prod.damagedQty + qty);
        movType = 'stock_out';
        movDir = 'out';
        if (partySnap && partySnap.exists()) {
          partyName = (partySnap.data() as Shop).shopName;
        }
      }

      tx.update(prodRef, {
        availableQty: newAvailable,
        damagedQty: newDamaged,
        updatedAt: now,
      });

      tx.set(
        doc(db, 'returns', retId),
        cleanOptional({
          returnNumber,
          returnType: input.returnType,
          returnDate: input.returnDate,
          partyType,
          partyId: input.partyId,
          partyName: partyName?.slice(0, 160),
          productId: input.productId,
          productName: prod.name.slice(0, 160),
          qty,
          unitValue,
          totalValue,
          condition: input.condition,
          returnedToStock,
          reason: input.reason.trim().slice(0, 300),
          linkedInvoiceNo: input.linkedInvoiceNo?.trim().slice(0, 64),
          status: 'completed',
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
        date: input.returnDate,
        productId: input.productId,
        productName: prod.name.slice(0, 160),
        sku: prod.sku.slice(0, 64),
        qty,
        movementType: movType,
        direction: movDir,
        referenceType: 'return',
        referenceId: retId,
        referenceNumber: returnNumber,
        warehouseZone: prod.warehouseZone || 'Main Rack A',
        notes: `${input.returnType}: ${input.reason}`,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
        createdBy: actor.uid,
        createdByName: actor.displayName.slice(0, 100),
      });

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: `RETURN_${input.returnType.toUpperCase()}`,
        module: 'returns',
        entityId: retId,
        entityLabel: returnNumber,
        details: `${input.returnType} of ${qty} ${prod.unit} ${prod.name} (${input.reason})`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });

    return retId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `returns/${retId}`);
  }
}

// =========================================================
// USERS, INVITES & SETTINGS
// =========================================================
export async function saveStaffInvite(
  actor: ActorContext,
  input: {
    email: string;
    displayName: string;
    phone?: string;
    role: UserRole;
    active: boolean;
  }
): Promise<void> {
  const emailLower = input.email.trim().toLowerCase();
  const id = emailToInviteId(emailLower);
  const ref = doc(db, 'staff_invites', id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const now = serverTimestamp();
      if (!snap.exists()) {
        tx.set(
          ref,
          cleanOptional({
            email: emailLower,
            displayName: input.displayName.trim().slice(0, 100),
            phone: input.phone?.trim().slice(0, 20),
            role: input.role,
            active: input.active,
            orgId: ORG_ID,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          })
        );
      } else {
        tx.update(
          ref,
          cleanOptional({
            displayName: input.displayName.trim().slice(0, 100),
            phone: input.phone?.trim().slice(0, 20) || '',
            role: input.role,
            active: input.active,
            updatedAt: now,
          })
        );
      }
      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: 'INVITE_STAFF',
        module: 'users',
        entityId: id,
        entityLabel: emailLower,
        details: `Invited/Updated staff ${emailLower} as ${input.role}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `staff_invites/${id}`);
  }
}

export async function updateStaffUser(
  actor: ActorContext,
  user: UserProfile,
  updates: { displayName: string; phone?: string; role: UserRole; active: boolean }
): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  try {
    await updateDoc(
      ref,
      cleanOptional({
        displayName: updates.displayName.trim().slice(0, 100),
        phone: updates.phone?.trim().slice(0, 20) || '',
        role: updates.role,
        active: updates.active,
        updatedAt: serverTimestamp(),
      })
    );
    await logAudit(
      actor,
      'UPDATE_USER_ROLE',
      'users',
      `Updated user ${user.email}: role=${updates.role}, active=${updates.active}`,
      user.uid,
      user.email
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
  }
}

export async function saveSettings(
  actor: ActorContext,
  input: Omit<AppSettings, 'id' | 'orgId' | 'updatedAt' | 'updatedBy'>
): Promise<void> {
  const ref = doc(db, 'settings', 'business_profile');
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const now = serverTimestamp();
      const basePayload = cleanOptional({
        businessName: input.businessName.trim().slice(0, 160),
        appName: input.appName.trim().slice(0, 160),
        location: input.location.trim().slice(0, 240),
        phone: input.phone?.trim().slice(0, 24),
        gstin: input.gstin?.trim().slice(0, 20),
        logoUrl: input.logoUrl?.slice(0, 80000),
        invoicePrefix: input.invoicePrefix.trim().slice(0, 20),
        invoiceSequence:
          input.invoiceSequence !== undefined ? Math.max(0, Number(input.invoiceSequence) || 0) : undefined,
        defaultPrintFormat: input.defaultPrintFormat,
        defaultLowStockThreshold:
          input.defaultLowStockThreshold !== undefined
            ? Math.max(0, Number(input.defaultLowStockThreshold) || 0)
            : undefined,
        allowNegativeStock: Boolean(input.allowNegativeStock),
        lastBackupAt: input.lastBackupAt,
        updatedAt: now,
        updatedBy: actor.uid,
      });
      if (!snap.exists()) {
        tx.set(ref, { ...basePayload, orgId: ORG_ID });
      } else {
        tx.update(ref, basePayload);
      }
      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: 'UPDATE_SETTINGS',
        module: 'settings',
        entityId: 'business_profile',
        entityLabel: input.businessName,
        details: `Updated business settings (allowNegativeStock=${input.allowNegativeStock})`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/business_profile');
  }
}

export async function removeAllDemoData(actor: ActorContext): Promise<number> {
  const collectionsToClean = [
    'products',
    'stock_batches',
    'suppliers',
    'shops',
    'purchases',
    'purchase_items',
    'sales',
    'sale_items',
    'invoices',
    'invoice_items',
    'stock_movements',
    'payments',
    'returns',
    'audit_logs',
  ];
  let deleted = 0;
  try {
    for (const colName of collectionsToClean) {
      const q = query(
        collection(db, colName),
        where('orgId', '==', ORG_ID),
        where('isDemo', '==', true)
      );
      const snap = await getDocs(q);
      if (snap.empty) continue;
      // Chunk into batches of 400
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of snap.docs.slice(i, i + 400)) {
          batch.delete(d.ref);
          deleted++;
        }
        await batch.commit();
      }
    }
    await logAudit(actor, 'REMOVE_DEMO_DATA', 'settings', `Removed ${deleted} demo records`);
    return deleted;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'demo_cleanup');
  }
}

// =========================================================
// DIGITAL BILL BOOK (INVOICES & INVOICE_ITEMS)
// =========================================================
export interface BillLineInput {
  productId: string;
  description?: string;
  qty: number;
  rate: number;
  discount: number;
}

function computeBillPaymentStatus(netTotal: number, paid: number): BillPaymentStatus {
  if (paid >= netTotal - 0.01 && (netTotal > 0 || paid >= 0)) {
    return 'paid';
  }
  if (paid > 0.01) return 'partial';
  return 'unpaid';
}

export async function createBillInvoiceTransaction(
  actor: ActorContext,
  input: {
    invoiceDate: string;
    shopId: string;
    items: BillLineInput[];
    discount: number;
    transportCharge: number;
    paymentReceived: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    status: 'draft' | 'confirmed';
    invoicePrefix?: string;
    allowNegativeStock: boolean;
  }
): Promise<string> {
  if (!input.items.length) throw new Error('Add at least one product line to create a bill.');
  const invoiceId = makeSafeId('inv');
  const shopRef = doc(db, 'shops', input.shopId);
  const settingsRef = doc(db, 'settings', 'business_profile');

  try {
    await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const shopSnap = await tx.get(shopRef);
      if (!shopSnap.exists()) throw new Error('Selected shop not found.');
      const shop = shopSnap.data() as Shop;

      const settingsSnap = await tx.get(settingsRef);
      const prodSnaps = await Promise.all(
        input.items.map((it) => tx.get(doc(db, 'products', it.productId)))
      );

      // 2. VALIDATIONS & TOTALS
      const now = serverTimestamp();
      let subtotal = 0;
      const computedLines = input.items.map((line, idx) => {
        const pSnap = prodSnaps[idx];
        if (!pSnap.exists()) throw new Error(`Product ${line.productId} not found.`);
        const prod = pSnap.data() as Product;
        const qty = Math.max(1, Number(line.qty) || 1);
        const rate = Math.max(0, roundMoney(line.rate));
        const lineDiscount = Math.max(0, roundMoney(line.discount));
        const amount = Math.max(0, roundMoney(qty * rate - lineDiscount));
        subtotal = roundMoney(subtotal + amount);

        if (input.status === 'confirmed' && prod.availableQty < qty) {
          if (!(input.allowNegativeStock && actor.role === 'owner')) {
            throw new Error(
              `Insufficient warehouse stock for ${prod.name}. Available: ${prod.availableQty}, Requested: ${qty}.`
            );
          }
        }

        return {
          productId: line.productId,
          prod,
          description: line.description?.trim().slice(0, 300),
          qty,
          rate,
          discount: lineDiscount,
          amount,
        };
      });

      const discount = Math.max(0, roundMoney(input.discount));
      const transportCharge = Math.max(0, roundMoney(input.transportCharge));
      const netTotal = Math.max(0, roundMoney(subtotal - discount + transportCharge));
      const paymentReceived =
        input.status === 'confirmed'
          ? Math.min(netTotal, Math.max(0, roundMoney(input.paymentReceived)))
          : Math.max(0, roundMoney(input.paymentReceived));
      const remainingDue = roundMoney(netTotal - paymentReceived);
      const paymentStatus = computeBillPaymentStatus(netTotal, paymentReceived);

      const prefix = (input.invoicePrefix || 'PDP').trim().slice(0, 12);
      let invoiceNumber = makeInvoiceNumber(`${prefix}-BILL`);
      let nextSeq: number | null = null;
      if (settingsSnap.exists()) {
        const sData = settingsSnap.data();
        const curSeq = Number(sData.invoiceSequence) || 1000;
        nextSeq = curSeq + 1;
        invoiceNumber = `${prefix}-${String(nextSeq).padStart(4, '0')}`;
      }

      const shopAddressText = [shop.address, shop.villageTown, shop.town, shop.blockArea, shop.district]
        .filter(Boolean)
        .join(', ');

      // 3. ALL WRITES
      tx.set(
        doc(db, 'invoices', invoiceId),
        cleanOptional({
          invoiceNumber: invoiceNumber.slice(0, 64),
          invoiceDate: input.invoiceDate,
          shopId: input.shopId,
          shopName: shop.shopName.slice(0, 160),
          shopPhone: shop.mobile.slice(0, 24),
          shopAddress: shopAddressText.slice(0, 300),
          shopBlock: shop.blockArea.slice(0, 100),
          status: input.status,
          paymentStatus,
          itemCount: computedLines.length,
          subtotal,
          discount,
          transportCharge,
          netTotal,
          previousOutstanding: roundMoney(shop.currentOutstanding),
          paymentReceived,
          remainingDue,
          paymentMethod: input.paymentMethod,
          notes: input.notes?.trim().slice(0, 500),
          orgId: ORG_ID,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      for (const item of computedLines) {
        tx.set(
          doc(db, 'invoice_items', makeSafeId('invi')),
          cleanOptional({
            invoiceId,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            description: item.description,
            sku: item.prod.sku.slice(0, 64),
            unit: item.prod.unit.slice(0, 32),
            qty: item.qty,
            rate: item.rate,
            discount: item.discount,
            amount: item.amount,
            unitCost: roundMoney(item.prod.purchasePrice),
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          })
        );

        if (input.status === 'confirmed') {
          tx.update(doc(db, 'products', item.productId), {
            availableQty: roundMoney(item.prod.availableQty - item.qty),
            updatedAt: now,
          });
          tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
            date: input.invoiceDate,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            sku: item.prod.sku.slice(0, 64),
            qty: item.qty,
            movementType: 'stock_out',
            direction: 'out',
            referenceType: 'bill_invoice',
            referenceId: invoiceId,
            referenceNumber: invoiceNumber.slice(0, 64),
            warehouseZone: item.prod.warehouseZone || 'Main Rack A',
            notes: `Billed to ${shop.shopName} (${invoiceNumber})`,
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      if (input.status === 'confirmed') {
        tx.update(shopRef, {
          totalPurchases: roundMoney(shop.totalPurchases + netTotal),
          totalPayments: roundMoney(shop.totalPayments + paymentReceived),
          currentOutstanding: roundMoney(shop.currentOutstanding + remainingDue),
          lastDeliveryDate: input.invoiceDate,
          updatedAt: now,
        });

        if (paymentReceived > 0) {
          tx.set(doc(db, 'payments', makeSafeId('pay')), {
            partyType: 'shop',
            partyId: input.shopId,
            partyName: shop.shopName.slice(0, 160),
            receiptNumber: makeInvoiceNumber('RCPT'),
            paymentDate: input.invoiceDate,
            amount: paymentReceived,
            method: input.paymentMethod,
            paymentKind: remainingDue > 0.01 ? 'partial' : 'full',
            linkedInvoiceId: invoiceId,
            linkedInvoiceNo: invoiceNumber.slice(0, 64),
            notes: `Payment on Bill ${invoiceNumber}`,
            status: 'active',
            orgId: ORG_ID,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      if (settingsSnap.exists() && nextSeq !== null) {
        tx.update(settingsRef, {
          invoiceSequence: nextSeq,
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: input.status === 'confirmed' ? 'CREATE_BILL_CONFIRMED' : 'CREATE_BILL_DRAFT',
        module: 'billbook',
        entityId: invoiceId,
        entityLabel: invoiceNumber.slice(0, 160),
        details: `${input.status === 'confirmed' ? 'Confirmed' : 'Saved draft'} bill ${invoiceNumber} for ${shop.shopName} (${netTotal} INR)`,
        newValue: `Status: ${input.status}, Total: ${netTotal}, Paid: ${paymentReceived}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: false,
        createdAt: now,
      });
    });

    return invoiceId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `invoices/${invoiceId}`);
  }
}

export async function updateAndConfirmDraftBillTransaction(
  actor: ActorContext,
  invoice: BillInvoice,
  existingItemIds: string[],
  input: {
    invoiceDate: string;
    shopId: string;
    items: BillLineInput[];
    discount: number;
    transportCharge: number;
    paymentReceived: number;
    paymentMethod: PaymentMethod;
    notes?: string;
    targetStatus: 'draft' | 'confirmed';
    allowNegativeStock: boolean;
  }
): Promise<void> {
  if (!input.items.length) throw new Error('Add at least one product line.');
  const invRef = doc(db, 'invoices', invoice.id);
  const shopRef = doc(db, 'shops', input.shopId);

  try {
    await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('Invoice not found.');
      const liveInv = invSnap.data() as BillInvoice;
      if (liveInv.status !== 'draft') {
        throw new Error('Only draft invoices can be edited.');
      }

      const shopSnap = await tx.get(shopRef);
      if (!shopSnap.exists()) throw new Error('Selected shop not found.');
      const shop = shopSnap.data() as Shop;

      const prodSnaps = await Promise.all(
        input.items.map((it) => tx.get(doc(db, 'products', it.productId)))
      );

      // 2. VALIDATE & COMPUTE
      const now = serverTimestamp();
      let subtotal = 0;
      const computedLines = input.items.map((line, idx) => {
        const pSnap = prodSnaps[idx];
        if (!pSnap.exists()) throw new Error(`Product ${line.productId} not found.`);
        const prod = pSnap.data() as Product;
        const qty = Math.max(1, Number(line.qty) || 1);
        const rate = Math.max(0, roundMoney(line.rate));
        const lineDiscount = Math.max(0, roundMoney(line.discount));
        const amount = Math.max(0, roundMoney(qty * rate - lineDiscount));
        subtotal = roundMoney(subtotal + amount);

        if (input.targetStatus === 'confirmed' && prod.availableQty < qty) {
          if (!(input.allowNegativeStock && actor.role === 'owner')) {
            throw new Error(
              `Insufficient warehouse stock for ${prod.name}. Available: ${prod.availableQty}, Requested: ${qty}.`
            );
          }
        }

        return {
          productId: line.productId,
          prod,
          description: line.description?.trim().slice(0, 300),
          qty,
          rate,
          discount: lineDiscount,
          amount,
        };
      });

      const discount = Math.max(0, roundMoney(input.discount));
      const transportCharge = Math.max(0, roundMoney(input.transportCharge));
      const netTotal = Math.max(0, roundMoney(subtotal - discount + transportCharge));
      const paymentReceived =
        input.targetStatus === 'confirmed'
          ? Math.min(netTotal, Math.max(0, roundMoney(input.paymentReceived)))
          : Math.max(0, roundMoney(input.paymentReceived));
      const remainingDue = roundMoney(netTotal - paymentReceived);
      const paymentStatus = computeBillPaymentStatus(netTotal, paymentReceived);
      const shopAddressText = [shop.address, shop.villageTown, shop.town, shop.blockArea, shop.district]
        .filter(Boolean)
        .join(', ');

      // 3. ALL WRITES: Delete old items, insert new items, update invoice
      for (const oldItemId of existingItemIds) {
        tx.delete(doc(db, 'invoice_items', oldItemId));
      }

      for (const item of computedLines) {
        tx.set(
          doc(db, 'invoice_items', makeSafeId('invi')),
          cleanOptional({
            invoiceId: invoice.id,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            description: item.description,
            sku: item.prod.sku.slice(0, 64),
            unit: item.prod.unit.slice(0, 32),
            qty: item.qty,
            rate: item.rate,
            discount: item.discount,
            amount: item.amount,
            unitCost: roundMoney(item.prod.purchasePrice),
            orgId: ORG_ID,
            isDemo: Boolean(liveInv.isDemo),
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
          })
        );

        if (input.targetStatus === 'confirmed') {
          tx.update(doc(db, 'products', item.productId), {
            availableQty: roundMoney(item.prod.availableQty - item.qty),
            updatedAt: now,
          });
          tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
            date: input.invoiceDate,
            productId: item.productId,
            productName: item.prod.name.slice(0, 160),
            sku: item.prod.sku.slice(0, 64),
            qty: item.qty,
            movementType: 'stock_out',
            direction: 'out',
            referenceType: 'bill_invoice',
            referenceId: invoice.id,
            referenceNumber: liveInv.invoiceNumber,
            warehouseZone: item.prod.warehouseZone || 'Main Rack A',
            notes: `Billed to ${shop.shopName} (${liveInv.invoiceNumber})`,
            orgId: ORG_ID,
            isDemo: Boolean(liveInv.isDemo),
            createdAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      tx.update(
        invRef,
        cleanOptional({
          invoiceDate: input.invoiceDate,
          shopId: input.shopId,
          shopName: shop.shopName.slice(0, 160),
          shopPhone: shop.mobile.slice(0, 24),
          shopAddress: shopAddressText.slice(0, 300),
          shopBlock: shop.blockArea.slice(0, 100),
          status: input.targetStatus,
          paymentStatus,
          itemCount: computedLines.length,
          subtotal,
          discount,
          transportCharge,
          netTotal,
          previousOutstanding: roundMoney(shop.currentOutstanding),
          paymentReceived,
          remainingDue,
          paymentMethod: input.paymentMethod,
          notes: input.notes?.trim().slice(0, 500) || '',
          updatedAt: now,
        })
      );

      if (input.targetStatus === 'confirmed') {
        tx.update(shopRef, {
          totalPurchases: roundMoney(shop.totalPurchases + netTotal),
          totalPayments: roundMoney(shop.totalPayments + paymentReceived),
          currentOutstanding: roundMoney(shop.currentOutstanding + remainingDue),
          lastDeliveryDate: input.invoiceDate,
          updatedAt: now,
        });

        if (paymentReceived > 0) {
          tx.set(doc(db, 'payments', makeSafeId('pay')), {
            partyType: 'shop',
            partyId: input.shopId,
            partyName: shop.shopName.slice(0, 160),
            receiptNumber: makeInvoiceNumber('RCPT'),
            paymentDate: input.invoiceDate,
            amount: paymentReceived,
            method: input.paymentMethod,
            paymentKind: remainingDue > 0.01 ? 'partial' : 'full',
            linkedInvoiceId: invoice.id,
            linkedInvoiceNo: liveInv.invoiceNumber,
            notes: `Payment on Bill ${liveInv.invoiceNumber}`,
            status: 'active',
            orgId: ORG_ID,
            isDemo: Boolean(liveInv.isDemo),
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            createdByName: actor.displayName.slice(0, 100),
          });
        }
      }

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: input.targetStatus === 'confirmed' ? 'CONFIRM_DRAFT_BILL' : 'UPDATE_DRAFT_BILL',
        module: 'billbook',
        entityId: invoice.id,
        entityLabel: liveInv.invoiceNumber,
        details: `${input.targetStatus === 'confirmed' ? 'Confirmed' : 'Updated'} draft bill ${liveInv.invoiceNumber} (${netTotal} INR)`,
        oldValue: `Status: draft, Total: ${liveInv.netTotal}`,
        newValue: `Status: ${input.targetStatus}, Total: ${netTotal}, Paid: ${paymentReceived}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: Boolean(liveInv.isDemo),
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `invoices/${invoice.id}`);
  }
}

export async function recordBillPaymentTransaction(
  actor: ActorContext,
  invoiceId: string,
  amount: number,
  paymentDate: string,
  method: PaymentMethod,
  referenceNo?: string,
  notes?: string
): Promise<string> {
  const invRef = doc(db, 'invoices', invoiceId);
  const payId = makeSafeId('pay');

  try {
    await runTransaction(db, async (tx) => {
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('Bill invoice not found.');
      const inv = invSnap.data() as BillInvoice;
      if (inv.status !== 'confirmed') throw new Error('Only confirmed bills can accept payments.');

      const shopRef = doc(db, 'shops', inv.shopId);
      const shopSnap = await tx.get(shopRef);
      if (!shopSnap.exists()) throw new Error('Shop not found.');
      const shop = shopSnap.data() as Shop;

      const payAmt = Math.min(Math.max(0.01, roundMoney(amount)), Math.max(0.01, roundMoney(inv.remainingDue)));
      const newPaid = roundMoney(inv.paymentReceived + payAmt);
      const newDue = roundMoney(inv.netTotal - newPaid);
      const newPayStatus = computeBillPaymentStatus(inv.netTotal, newPaid);
      const receiptNumber = makeInvoiceNumber('RCPT');
      const now = serverTimestamp();

      tx.update(invRef, {
        paymentReceived: newPaid,
        remainingDue: newDue,
        paymentStatus: newPayStatus,
        paymentMethod: method,
        updatedAt: now,
      });

      tx.update(shopRef, {
        totalPayments: roundMoney(shop.totalPayments + payAmt),
        currentOutstanding: roundMoney(shop.currentOutstanding - payAmt),
        updatedAt: now,
      });

      tx.set(
        doc(db, 'payments', payId),
        cleanOptional({
          partyType: 'shop',
          partyId: inv.shopId,
          partyName: shop.shopName.slice(0, 160),
          receiptNumber,
          paymentDate,
          amount: payAmt,
          method,
          paymentKind: newDue > 0.01 ? 'partial' : 'full',
          referenceNo: referenceNo?.trim().slice(0, 80),
          linkedInvoiceId: invoiceId,
          linkedInvoiceNo: inv.invoiceNumber,
          notes: notes?.trim().slice(0, 500) || `Payment against Bill ${inv.invoiceNumber}`,
          status: 'active',
          orgId: ORG_ID,
          isDemo: Boolean(inv.isDemo),
          createdAt: now,
          updatedAt: now,
          createdBy: actor.uid,
          createdByName: actor.displayName.slice(0, 100),
        })
      );

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: 'BILL_PAYMENT',
        module: 'billbook',
        entityId: invoiceId,
        entityLabel: inv.invoiceNumber,
        details: `Collected ${payAmt} INR against Bill ${inv.invoiceNumber} (${receiptNumber})`,
        oldValue: `Paid: ${inv.paymentReceived}, Due: ${inv.remainingDue}`,
        newValue: `Paid: ${newPaid}, Due: ${newDue}`,
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: Boolean(inv.isDemo),
        createdAt: now,
      });
    });
    return payId;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `invoices/${invoiceId}`);
  }
}

export async function cancelBillInvoiceTransaction(
  actor: ActorContext,
  invoice: BillInvoice,
  items: BillInvoiceItem[],
  reason: string
): Promise<void> {
  if (actor.role !== 'owner' && actor.role !== 'accounts') {
    throw new Error('Only Owner or Accounts Staff can cancel an invoice.');
  }
  const invRef = doc(db, 'invoices', invoice.id);
  const shopRef = doc(db, 'shops', invoice.shopId);

  try {
    await runTransaction(db, async (tx) => {
      // 1. ALL READS FIRST
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('Bill invoice not found.');
      const liveInv = invSnap.data() as BillInvoice;
      if (liveInv.status === 'cancelled') throw new Error('Invoice is already cancelled.');

      const shopSnap = liveInv.status === 'confirmed' ? await tx.get(shopRef) : null;
      const prodSnaps =
        liveInv.status === 'confirmed'
          ? await Promise.all(items.map((it) => tx.get(doc(db, 'products', it.productId))))
          : [];

      const now = serverTimestamp();
      const today = new Date().toISOString().slice(0, 10);

      // 2. RESTORE STOCK & LEDGERS IF CONFIRMED
      if (liveInv.status === 'confirmed') {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const pSnap = prodSnaps[i];
          if (pSnap && pSnap.exists()) {
            const prod = pSnap.data() as Product;
            tx.update(doc(db, 'products', it.productId), {
              availableQty: roundMoney(prod.availableQty + it.qty),
              updatedAt: now,
            });
            tx.set(doc(db, 'stock_movements', makeSafeId('mov')), {
              date: today,
              productId: it.productId,
              productName: it.productName.slice(0, 160),
              sku: it.sku.slice(0, 64),
              qty: it.qty,
              movementType: 'stock_in',
              direction: 'in',
              referenceType: 'bill_cancelled',
              referenceId: invoice.id,
              referenceNumber: liveInv.invoiceNumber,
              warehouseZone: prod.warehouseZone || 'Main Rack A',
              notes: `Stock restored from cancelled Bill ${liveInv.invoiceNumber}: ${reason}`,
              orgId: ORG_ID,
              isDemo: Boolean(liveInv.isDemo),
              createdAt: now,
              createdBy: actor.uid,
              createdByName: actor.displayName.slice(0, 100),
            });
          }
        }

        if (shopSnap && shopSnap.exists()) {
          const shop = shopSnap.data() as Shop;
          tx.update(shopRef, {
            totalPurchases: Math.max(0, roundMoney(shop.totalPurchases - liveInv.netTotal)),
            totalPayments: Math.max(0, roundMoney(shop.totalPayments - liveInv.paymentReceived)),
            currentOutstanding: roundMoney(shop.currentOutstanding - liveInv.remainingDue),
            updatedAt: now,
          });
        }
      }

      tx.update(invRef, {
        status: 'cancelled',
        cancelledReason: reason.trim().slice(0, 300),
        cancelledBy: actor.uid,
        updatedAt: now,
      });

      tx.set(doc(db, 'audit_logs', makeSafeId('aud')), {
        action: 'CANCEL_BILL',
        module: 'billbook',
        entityId: invoice.id,
        entityLabel: liveInv.invoiceNumber,
        details: `Cancelled Bill ${liveInv.invoiceNumber} (${liveInv.netTotal} INR). Reason: ${reason}`,
        oldValue: `Status: ${liveInv.status}`,
        newValue: 'Status: cancelled',
        notes: reason.trim().slice(0, 500),
        userId: actor.uid,
        userName: actor.displayName.slice(0, 100),
        userRole: actor.role,
        orgId: ORG_ID,
        isDemo: Boolean(liveInv.isDemo),
        createdAt: now,
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `invoices/${invoice.id}`);
  }
}
