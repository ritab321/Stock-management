import type { NavTab, UserRole } from '../types/erp';

export interface RoleCapabilities {
  label: string;
  labelBn: string;
  allowedTabs: NavTab[];
  canViewPurchasePrices: boolean;
  canViewProfitMetrics: boolean;
  canViewSupplierFinancials: boolean;
  canViewCustomerLedgers: boolean;
  canManageProducts: boolean;
  canDeleteProducts: boolean;
  canManageSuppliers: boolean;
  canManagePurchases: boolean;
  canManageWarehouse: boolean;
  canManageShops: boolean;
  canCreateSales: boolean;
  canAccessBillBook: boolean;
  canRecordShopPayments: boolean;
  canRecordSupplierPayments: boolean;
  canReverseFinancials: boolean;
  canManageReturns: boolean;
  canManageUsers: boolean;
  canManageSettings: boolean;
  canAuthorizeNegativeStock: boolean;
  canManageDemoData: boolean;
}

export const ROLE_CAPABILITIES: Record<UserRole, RoleCapabilities> = {
  owner: {
    label: 'Owner / Super Admin',
    labelBn: 'মালিক / সুপার অ্যাডমিন',
    allowedTabs: [
      'dashboard',
      'products',
      'warehouse',
      'purchases',
      'suppliers',
      'shops',
      'sales',
      'billbook',
      'payments',
      'outstanding',
      'returns',
      'ledgers',
      'reports',
      'users',
      'settings',
    ],
    canViewPurchasePrices: true,
    canViewProfitMetrics: true,
    canViewSupplierFinancials: true,
    canViewCustomerLedgers: true,
    canManageProducts: true,
    canDeleteProducts: true,
    canManageSuppliers: true,
    canManagePurchases: true,
    canManageWarehouse: true,
    canManageShops: true,
    canCreateSales: true,
    canAccessBillBook: true,
    canRecordShopPayments: true,
    canRecordSupplierPayments: true,
    canReverseFinancials: true,
    canManageReturns: true,
    canManageUsers: true,
    canManageSettings: true,
    canAuthorizeNegativeStock: true,
    canManageDemoData: true,
  },
  manager: {
    label: 'Manager',
    labelBn: 'ম্যানেজার',
    allowedTabs: [
      'dashboard',
      'products',
      'warehouse',
      'purchases',
      'suppliers',
      'shops',
      'sales',
      'billbook',
      'payments',
      'outstanding',
      'returns',
      'ledgers',
      'reports',
    ],
    canViewPurchasePrices: true,
    canViewProfitMetrics: true,
    canViewSupplierFinancials: true,
    canViewCustomerLedgers: true,
    canManageProducts: true,
    canDeleteProducts: false,
    canManageSuppliers: true,
    canManagePurchases: true,
    canManageWarehouse: true,
    canManageShops: true,
    canCreateSales: true,
    canAccessBillBook: true,
    canRecordShopPayments: true,
    canRecordSupplierPayments: true,
    canReverseFinancials: false,
    canManageReturns: true,
    canManageUsers: false,
    canManageSettings: false,
    canAuthorizeNegativeStock: false,
    canManageDemoData: false,
  },
  sales: {
    label: 'Sales Staff',
    labelBn: 'বিক্রয় কর্মী',
    allowedTabs: ['dashboard', 'products', 'shops', 'sales', 'billbook', 'payments', 'outstanding', 'returns'],
    canViewPurchasePrices: false,
    canViewProfitMetrics: false,
    canViewSupplierFinancials: false,
    canViewCustomerLedgers: true,
    canManageProducts: false,
    canDeleteProducts: false,
    canManageSuppliers: false,
    canManagePurchases: false,
    canManageWarehouse: false,
    canManageShops: true,
    canCreateSales: true,
    canAccessBillBook: true,
    canRecordShopPayments: true,
    canRecordSupplierPayments: false,
    canReverseFinancials: false,
    canManageReturns: true,
    canManageUsers: false,
    canManageSettings: false,
    canAuthorizeNegativeStock: false,
    canManageDemoData: false,
  },
  accounts: {
    label: 'Accounts Staff',
    labelBn: 'হিসাবরক্ষক',
    allowedTabs: [
      'dashboard',
      'suppliers',
      'purchases',
      'shops',
      'sales',
      'billbook',
      'payments',
      'outstanding',
      'returns',
      'ledgers',
      'reports',
    ],
    canViewPurchasePrices: true,
    canViewProfitMetrics: true,
    canViewSupplierFinancials: true,
    canViewCustomerLedgers: true,
    canManageProducts: false,
    canDeleteProducts: false,
    canManageSuppliers: true,
    canManagePurchases: false,
    canManageWarehouse: false,
    canManageShops: true,
    canCreateSales: false,
    canAccessBillBook: true,
    canRecordShopPayments: true,
    canRecordSupplierPayments: true,
    canReverseFinancials: true,
    canManageReturns: false,
    canManageUsers: false,
    canManageSettings: false,
    canAuthorizeNegativeStock: false,
    canManageDemoData: false,
  },
  stock: {
    label: 'Stock Manager',
    labelBn: 'স্টক ম্যানেজার',
    allowedTabs: ['dashboard', 'products', 'warehouse', 'purchases', 'suppliers', 'returns', 'reports'],
    canViewPurchasePrices: true,
    canViewProfitMetrics: false,
    canViewSupplierFinancials: false,
    canViewCustomerLedgers: false,
    canManageProducts: true,
    canDeleteProducts: false,
    canManageSuppliers: false,
    canManagePurchases: true,
    canManageWarehouse: true,
    canManageShops: false,
    canCreateSales: false,
    canAccessBillBook: false,
    canRecordShopPayments: false,
    canRecordSupplierPayments: false,
    canReverseFinancials: false,
    canManageReturns: true,
    canManageUsers: false,
    canManageSettings: false,
    canAuthorizeNegativeStock: false,
    canManageDemoData: false,
  },
};

export function getRoleCapabilities(role?: UserRole): RoleCapabilities {
  return ROLE_CAPABILITIES[role || 'sales'];
}
