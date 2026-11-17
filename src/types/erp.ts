import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'owner' | 'manager' | 'sales' | 'accounts' | 'stock';
export type Language = 'en' | 'bn';

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  orgId: string;
  inviteId?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export interface StaffInvite {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  orgId: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  brand?: string;
  category: string;
  imageUrl?: string;
  purchasePrice: number;
  sellingPrice: number;
  minStockAlert: number;
  availableQty: number;
  damagedQty: number;
  unit: string;
  status: 'active' | 'inactive';
  warehouseZone?: string;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export interface StockBatch {
  id: string;
  productId: string;
  purchaseId?: string;
  batchNo: string;
  supplierId?: string;
  unitCost: number;
  initialQty: number;
  remainingQty: number;
  purchaseDate: string; // YYYY-MM-DD
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  address?: string;
  gstin?: string;
  openingBalance: number;
  totalPurchases: number;
  totalPayments: number;
  totalReturns: number;
  outstandingPayable: number;
  status: 'active' | 'inactive';
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export interface Shop {
  id: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  whatsapp?: string;
  address?: string;
  villageTown: string;
  blockArea: string;
  district: string;
  route?: string;
  openingBalance: number;
  creditLimit: number;
  totalPurchases: number;
  totalPayments: number;
  totalReturns: number;
  totalCreditNotes: number;
  currentOutstanding: number;
  lastDeliveryDate?: string;
  status: 'active' | 'inactive';
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export type PurchaseType = 'warehouse' | 'direct_to_shop';

export interface Purchase {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string; // YYYY-MM-DD
  purchaseType: PurchaseType;
  targetShopId?: string;
  targetShopName?: string;
  linkedSaleId?: string;
  itemCount: number;
  subtotal: number;
  discount: number;
  additionalExpenses: number;
  totalCost: number;
  amountPaid: number;
  remainingDue: number;
  status: 'completed' | 'partial' | 'reversed';
  notes?: string;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
  createdByName: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  qty: number;
  unitRate: number;
  lineTotal: number;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  createdBy: string;
}

export type DeliveryMethod = 'warehouse_dispatch' | 'direct_supplier_dispatch';
export type DeliveryStatus = 'delivered' | 'partial' | 'pending' | 'reversed';

export interface Sale {
  id: string;
  invoiceNumber: string;
  deliveryMethod: DeliveryMethod;
  shopId: string;
  shopName: string;
  shopBlock?: string;
  shopDistrict?: string;
  supplierId?: string;
  supplierName?: string;
  supplierInvoiceNo?: string;
  linkedPurchaseId?: string;
  saleDate: string; // YYYY-MM-DD
  deliveryStatus: DeliveryStatus;
  itemCount: number;
  subtotal: number;
  discount: number;
  transportExpense: number;
  netTotal: number;
  totalCost: number;
  grossProfit: number;
  paymentReceived: number;
  remainingDue: number;
  notes?: string;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
  createdByName: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  orderedQty: number;
  deliveredQty: number;
  unitCost: number;
  sellingPrice: number;
  lineTotal: number;
  lineCost: number;
  lineProfit: number;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
}

export type MovementType =
  | 'stock_in'
  | 'stock_out'
  | 'adjustment'
  | 'damaged'
  | 'transfer'
  | 'verification'
  | 'shop_return'
  | 'supplier_return';

export interface StockMovement {
  id: string;
  date: string; // YYYY-MM-DD
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  movementType: MovementType;
  direction: 'in' | 'out' | 'neutral';
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  warehouseZone?: string;
  notes?: string;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  createdBy: string;
  createdByName: string;
}

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';
export type PaymentKind = 'full' | 'partial' | 'advance' | 'credit_note' | 'refund' | 'opening_adjustment';

export interface Payment {
  id: string;
  partyType: 'shop' | 'supplier';
  partyId: string;
  partyName: string;
  receiptNumber: string;
  paymentDate: string; // YYYY-MM-DD
  amount: number;
  method: PaymentMethod;
  paymentKind: PaymentKind;
  referenceNo?: string;
  linkedInvoiceId?: string;
  linkedInvoiceNo?: string;
  notes?: string;
  status: 'active' | 'reversed';
  reversalReason?: string;
  reversedBy?: string;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
  createdByName: string;
}

export type ReturnType = 'shop_return' | 'supplier_return' | 'damaged_writeoff' | 'replacement';

export interface ReturnRecord {
  id: string;
  returnNumber: string;
  returnType: ReturnType;
  returnDate: string; // YYYY-MM-DD
  partyType: 'shop' | 'supplier' | 'internal';
  partyId?: string;
  partyName?: string;
  productId: string;
  productName: string;
  qty: number;
  unitValue: number;
  totalValue: number;
  condition: 'good_sellable' | 'damaged';
  returnedToStock: boolean;
  reason: string;
  linkedInvoiceNo?: string;
  status: 'completed' | 'reversed';
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  createdBy: string;
  createdByName: string;
}

export interface AuditLog {
  id: string;
  action: string;
  module: string;
  entityId?: string;
  entityLabel?: string;
  details: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  orgId: string;
  isDemo: boolean;
  createdAt?: Timestamp | null;
}

export interface AppSettings {
  id: string;
  businessName: string;
  appName: string;
  location: string;
  phone?: string;
  gstin?: string;
  invoicePrefix: string;
  allowNegativeStock: boolean;
  lastBackupAt?: string;
  orgId: string;
  updatedAt?: Timestamp | null;
  updatedBy: string;
}

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category:
    | 'out_of_stock'
    | 'low_stock'
    | 'credit_limit'
    | 'overdue_shop'
    | 'supplier_due'
    | 'pending_delivery'
    | 'stock_adjustment';
  title: string;
  description: string;
  targetTab: string;
}

export type NavTab =
  | 'dashboard'
  | 'products'
  | 'suppliers'
  | 'purchases'
  | 'warehouse'
  | 'shops'
  | 'sales'
  | 'payments'
  | 'returns'
  | 'ledgers'
  | 'reports'
  | 'users'
  | 'settings';
