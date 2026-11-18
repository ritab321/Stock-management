import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAP_OWNER_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  ORG_ID,
  testFirestoreConnection,
} from '../lib/firebase';
import { addDaysIST, formatINR, getTodayIST } from '../lib/formatters';
import { getRoleCapabilities, type RoleCapabilities } from '../lib/permissions';
import type {
  AlertItem,
  AppSettings,
  AuditLog,
  BillInvoice,
  BillInvoiceItem,
  Language,
  Payment,
  Product,
  Purchase,
  PurchaseItem,
  ReturnRecord,
  Sale,
  SaleItem,
  Shop,
  StaffInvite,
  StockBatch,
  StockMovement,
  Supplier,
  UserProfile,
} from '../types/erp';

interface ErpContextValue {
  firebaseUser: FirebaseUser | null;
  authLoading: boolean;
  authError: string | null;
  accessDeniedReason: 'none' | 'uninvited' | 'deactivated' | 'unverified';
  profile: UserProfile | null;
  caps: RoleCapabilities;
  lang: Language;
  setLang: (l: Language) => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  // Live Firestore Data
  products: Product[];
  stockBatches: StockBatch[];
  suppliers: Supplier[];
  shops: Shop[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  sales: Sale[];
  saleItems: SaleItem[];
  invoices: BillInvoice[];
  invoiceItems: BillInvoiceItem[];
  stockMovements: StockMovement[];
  payments: Payment[];
  returns: ReturnRecord[];
  auditLogs: AuditLog[];
  users: UserProfile[];
  staffInvites: StaffInvite[];
  settings: AppSettings | null;
  alerts: AlertItem[];
  hasDemoData: boolean;
  dataLoading: boolean;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export const ErpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessDeniedReason, setAccessDeniedReason] = useState<
    'none' | 'uninvited' | 'deactivated' | 'unverified'
  >('none');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lang, setLangState] = useState<Language>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('pdp_lang') : null;
    return saved === 'bn' ? 'bn' : 'en';
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [stockBatches, setStockBatches] = useState<StockBatch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [invoices, setInvoices] = useState<BillInvoice[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<BillInvoiceItem[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  const setLang = (l: Language) => {
    setLangState(l);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('pdp_lang', l);
    }
  };

  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Auth & Profile Resolution
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      setAccessDeniedReason('none');

      if (!user) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      if (!user.email || !user.emailVerified) {
        setAccessDeniedReason('unverified');
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = { id: snap.id, ...(snap.data() as Omit<UserProfile, 'id'>) };
          if (!data.active) {
            setAccessDeniedReason('deactivated');
            setProfile(null);
          } else {
            setProfile(data);
          }
          setAuthLoading(false);
          return;
        }

        const emailLower = user.email.toLowerCase();
        if (emailLower === BOOTSTRAP_OWNER_EMAIL.toLowerCase()) {
          const ownerDoc = {
            uid: user.uid,
            email: emailLower,
            displayName: user.displayName || 'Pramanik Owner',
            role: 'owner' as const,
            active: true,
            orgId: ORG_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid,
          };
          await setDoc(userRef, ownerDoc);
          const createdSnap = await getDoc(userRef);
          if (createdSnap.exists()) {
            setProfile({ id: createdSnap.id, ...(createdSnap.data() as Omit<UserProfile, 'id'>) });
          }
          setAuthLoading(false);
          return;
        }

        // Check staff_invites for non-owner email
        const invQ = query(
          collection(db, 'staff_invites'),
          where('email', '==', emailLower),
          where('active', '==', true)
        );
        const invSnap = await getDocs(invQ);
        if (invSnap.empty) {
          setAccessDeniedReason('uninvited');
          setProfile(null);
          setAuthLoading(false);
          return;
        }

        const inviteDoc = invSnap.docs[0];
        const inviteData = inviteDoc.data() as StaffInvite;
        const staffPayload: Record<string, unknown> = {
          uid: user.uid,
          email: emailLower,
          displayName: inviteData.displayName || user.displayName || emailLower.split('@')[0],
          role: inviteData.role,
          active: true,
          orgId: ORG_ID,
          inviteId: inviteDoc.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user.uid,
        };
        if (inviteData.phone) {
          staffPayload.phone = inviteData.phone;
        }
        await setDoc(userRef, staffPayload);
        const createdStaff = await getDoc(userRef);
        if (createdStaff.exists()) {
          setProfile({ id: createdStaff.id, ...(createdStaff.data() as Omit<UserProfile, 'id'>) });
        }
      } catch (err) {
        console.error('Auth resolution error:', err);
        setAuthError(err instanceof Error ? err.message : 'Authentication check failed.');
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Role-Scoped Real-time Firestore Listeners
  useEffect(() => {
    if (!profile || !profile.active) {
      setProducts([]);
      setStockBatches([]);
      setSuppliers([]);
      setShops([]);
      setPurchases([]);
      setPurchaseItems([]);
      setSales([]);
      setSaleItems([]);
      setInvoices([]);
      setInvoiceItems([]);
      setStockMovements([]);
      setPayments([]);
      setReturns([]);
      setAuditLogs([]);
      setUsers([]);
      setStaffInvites([]);
      return;
    }

    setDataLoading(true);
    const unsubs: Unsubscribe[] = [];
    const role = profile.role;

    const orgWhere = where('orgId', '==', ORG_ID);

    const subscribeCol = <T,>(
      colName: string,
      setter: (items: T[]) => void,
      extraConstraints: ReturnType<typeof where>[] = []
    ) => {
      const q = query(collection(db, colName), orgWhere, ...extraConstraints);
      const u = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) })) as T[];
          setter(list);
          setDataLoading(false);
        },
        (err) => {
          setDataLoading(false);
          handleFirestoreError(err, OperationType.LIST, colName);
        }
      );
      unsubs.push(u);
    };

    // Accessible to all active staff
    subscribeCol<Product>('products', setProducts);
    subscribeCol<StockBatch>('stock_batches', setStockBatches);
    subscribeCol<Supplier>('suppliers', setSuppliers);
    subscribeCol<StockMovement>('stock_movements', setStockMovements);
    subscribeCol<ReturnRecord>('returns', setReturns);
    subscribeCol<AuditLog>('audit_logs', setAuditLogs);
    subscribeCol<AppSettings>('settings', (list) => {
      setSettings(list[0] || null);
    });

    // Purchases: owner, manager, stock, accounts
    if (['owner', 'manager', 'stock', 'accounts'].includes(role)) {
      subscribeCol<Purchase>('purchases', setPurchases);
      subscribeCol<PurchaseItem>('purchase_items', setPurchaseItems);
    } else {
      setPurchases([]);
      setPurchaseItems([]);
    }

    // Shops, Sales, SaleItems, Digital Bill Book: owner, manager, sales, accounts
    if (['owner', 'manager', 'sales', 'accounts'].includes(role)) {
      subscribeCol<Shop>('shops', setShops);
      subscribeCol<Sale>('sales', setSales);
      subscribeCol<SaleItem>('sale_items', setSaleItems);
      subscribeCol<BillInvoice>('invoices', setInvoices);
      subscribeCol<BillInvoiceItem>('invoice_items', setInvoiceItems);
    } else {
      setShops([]);
      setSales([]);
      setSaleItems([]);
      setInvoices([]);
      setInvoiceItems([]);
    }

    // Payments: owner, manager, accounts read all; sales reads shop payments only
    if (['owner', 'manager', 'accounts'].includes(role)) {
      subscribeCol<Payment>('payments', setPayments);
    } else if (role === 'sales') {
      subscribeCol<Payment>('payments', setPayments, [where('partyType', '==', 'shop')]);
    } else {
      setPayments([]);
    }

    // Users & Invites: owner only
    if (role === 'owner') {
      subscribeCol<UserProfile>('users', setUsers);
      subscribeCol<StaffInvite>('staff_invites', setStaffInvites);
    } else {
      setUsers([]);
      setStaffInvites([]);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [profile]);

  const caps = useMemo(() => getRoleCapabilities(profile?.role), [profile?.role]);

  const alerts = useMemo<AlertItem[]>(() => {
    const out: AlertItem[] = [];
    const today = getTodayIST();
    const overdueCutoff = addDaysIST(today, -14);

    for (const p of products) {
      if (p.status !== 'active') continue;
      if (p.availableQty <= 0) {
        out.push({
          id: `oos_${p.id}`,
          severity: 'critical',
          category: 'out_of_stock',
          title: `Out of Stock: ${p.name}`,
          description: `SKU ${p.sku} has ${p.availableQty} ${p.unit} in warehouse.`,
          targetTab: 'warehouse',
        });
      } else if (p.availableQty <= p.minStockAlert) {
        out.push({
          id: `low_${p.id}`,
          severity: 'warning',
          category: 'low_stock',
          title: `Low Stock: ${p.name}`,
          description: `${p.availableQty} ${p.unit} remaining (alert level ${p.minStockAlert}).`,
          targetTab: 'warehouse',
        });
      }
    }

    if (caps.canViewCustomerLedgers) {
      for (const sh of shops) {
        if (sh.status !== 'active') continue;
        if (sh.creditLimit > 0 && sh.currentOutstanding > sh.creditLimit) {
          out.push({
            id: `clim_${sh.id}`,
            severity: 'critical',
            category: 'credit_limit',
            title: `Credit Limit Exceeded: ${sh.shopName}`,
            description: `Outstanding ${formatINR(sh.currentOutstanding)} exceeds limit ${formatINR(sh.creditLimit)}.`,
            targetTab: 'shops',
          });
        } else if (sh.currentOutstanding > 0 && sh.lastDeliveryDate && sh.lastDeliveryDate < overdueCutoff) {
          out.push({
            id: `ovd_${sh.id}`,
            severity: 'warning',
            category: 'overdue_shop',
            title: `Overdue Balance: ${sh.shopName}`,
            description: `${formatINR(sh.currentOutstanding)} due since ${sh.lastDeliveryDate}.`,
            targetTab: 'payments',
          });
        }
      }
    }

    if (caps.canViewSupplierFinancials) {
      for (const sup of suppliers) {
        if (sup.status === 'active' && sup.outstandingPayable > 0) {
          out.push({
            id: `supdue_${sup.id}`,
            severity: 'info',
            category: 'supplier_due',
            title: `Supplier Payable: ${sup.name}`,
            description: `${formatINR(sup.outstandingPayable)} payable.`,
            targetTab: 'suppliers',
          });
        }
      }
    }

    if (caps.canCreateSales || profile?.role === 'manager' || profile?.role === 'accounts') {
      for (const s of sales) {
        if (s.deliveryStatus === 'partial' || s.deliveryStatus === 'pending') {
          out.push({
            id: `pend_${s.id}`,
            severity: 'warning',
            category: 'pending_delivery',
            title: `Pending Delivery: ${s.invoiceNumber}`,
            description: `${s.shopName} (${s.deliveryStatus})`,
            targetTab: 'sales',
          });
        }
      }
    }

    for (const m of stockMovements.slice(0, 40)) {
      if ((m.movementType === 'adjustment' || m.movementType === 'damaged') && Math.abs(m.qty) >= 5) {
        out.push({
          id: `adj_${m.id}`,
          severity: 'warning',
          category: 'stock_adjustment',
          title: `Unusual Stock ${m.movementType === 'damaged' ? 'Damage' : 'Adjustment'}: ${m.productName}`,
          description: `${m.qty} units recorded on ${m.date} by ${m.createdByName}.`,
          targetTab: 'warehouse',
        });
      }
    }

    return out;
  }, [products, shops, suppliers, sales, stockMovements, caps, profile?.role]);

  const hasDemoData = useMemo(
    () =>
      products.some((p) => p.isDemo) ||
      shops.some((s) => s.isDemo) ||
      suppliers.some((s) => s.isDemo) ||
      sales.some((s) => s.isDemo) ||
      invoices.some((i) => i.isDemo),
    [products, shops, suppliers, sales, invoices]
  );

  const loginWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In cancelled or failed.');
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <ErpContext.Provider
      value={{
        firebaseUser,
        authLoading,
        authError,
        accessDeniedReason,
        profile,
        caps,
        lang,
        setLang,
        loginWithGoogle,
        logout,
        products,
        stockBatches,
        suppliers,
        shops,
        purchases,
        purchaseItems,
        sales,
        saleItems,
        invoices,
        invoiceItems,
        stockMovements,
        payments,
        returns,
        auditLogs,
        users,
        staffInvites,
        settings,
        alerts,
        hasDemoData,
        dataLoading,
      }}
    >
      {children}
    </ErpContext.Provider>
  );
};

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error('useErp must be used inside ErpProvider');
  return ctx;
}
