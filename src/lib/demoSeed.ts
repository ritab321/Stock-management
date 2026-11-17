import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ORG_ID } from './firebase';
import { addDaysIST, getTodayIST } from './formatters';
import type { ActorContext } from './erpService';

// Exact generated local studio product images
const IMG_EARBUDS = '/src/assets/images/product_tws_earbuds_1794836500474.jpg';
const IMG_CHARGER = '/src/assets/images/product_fast_charger_1794836501777.jpg';
const IMG_POWERBANK = '/src/assets/images/product_power_bank_1794836500703.jpg';
const IMG_CABLE = '/src/assets/images/product_usbc_cable_1794836501344.jpg';

export async function seedDemoData(actor: ActorContext): Promise<void> {
  const today = getTodayIST();
  const y1 = addDaysIST(today, -1);
  const y3 = addDaysIST(today, -3);
  const y6 = addDaysIST(today, -6);

  const batch = writeBatch(db);
  const now = serverTimestamp();

  // 1. Settings (non-demo config)
  batch.set(doc(db, 'settings', 'business_profile'), {
    businessName: 'Pramanik Digital Point',
    appName: 'Pramanik Stock Manager',
    location: 'Singda, Dantan, Paschim Medinipur, West Bengal 721426',
    phone: '+91 97320 45120',
    gstin: '19AABCP4821M1Z5',
    invoicePrefix: 'PDP',
    allowNegativeStock: false,
    orgId: ORG_ID,
    updatedAt: now,
    updatedBy: actor.uid,
  });

  // 2. Demo Products (with generated studio photos!)
  const products = [
    {
      id: 'demo_prod_earbuds',
      name: '[DEMO] AuraPods Pro TWS Earbuds',
      sku: 'PDP-TWS-101',
      barcode: '8901425001011',
      brand: 'AuraAudio',
      category: 'Audio & Earbuds',
      imageUrl: IMG_EARBUDS,
      purchasePrice: 540,
      sellingPrice: 690,
      minStockAlert: 15,
      availableQty: 42,
      damagedQty: 2,
      unit: 'Piece',
      status: 'active',
      warehouseZone: 'Main Rack A1',
    },
    {
      id: 'demo_prod_charger',
      name: '[DEMO] 65W GaN Dual-Port Fast Charger',
      sku: 'PDP-CHG-204',
      barcode: '8901425002049',
      brand: 'VoltEdge',
      category: 'Chargers & Adapters',
      imageUrl: IMG_CHARGER,
      purchasePrice: 460,
      sellingPrice: 595,
      minStockAlert: 20,
      availableQty: 14, // Low stock alert!
      damagedQty: 0,
      unit: 'Piece',
      status: 'active',
      warehouseZone: 'Main Rack A2',
    },
    {
      id: 'demo_prod_powerbank',
      name: '[DEMO] SlimPower 20000mAh Digital Power Bank',
      sku: 'PDP-PB-305',
      barcode: '8901425003053',
      brand: 'SlimPower',
      category: 'Power Banks',
      imageUrl: IMG_POWERBANK,
      purchasePrice: 780,
      sellingPrice: 960,
      minStockAlert: 10,
      availableQty: 26,
      damagedQty: 1,
      unit: 'Piece',
      status: 'active',
      warehouseZone: 'Ground Bay B1',
    },
    {
      id: 'demo_prod_cable',
      name: '[DEMO] Braided 60W USB-C Data Cable (Box of 10)',
      sku: 'PDP-CBL-410',
      barcode: '8901425004104',
      brand: 'VoltEdge',
      category: 'Cables & Connectors',
      imageUrl: IMG_CABLE,
      purchasePrice: 620,
      sellingPrice: 820,
      minStockAlert: 12,
      availableQty: 0, // Out of stock alert!
      damagedQty: 0,
      unit: 'Box',
      status: 'active',
      warehouseZone: 'Main Rack B3',
    },
  ];

  for (const p of products) {
    batch.set(doc(db, 'products', p.id), {
      ...p,
      orgId: ORG_ID,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
    });
  }

  // 3. Demo Stock Batches (showing multi-batch pricing!)
  const batches = [
    {
      id: 'demo_bat_1',
      productId: 'demo_prod_earbuds',
      purchaseId: 'demo_pur_1',
      batchNo: 'B-CHANDNI-01',
      supplierId: 'demo_sup_1',
      unitCost: 520,
      initialQty: 30,
      remainingQty: 12,
      purchaseDate: y6,
    },
    {
      id: 'demo_bat_2',
      productId: 'demo_prod_earbuds',
      purchaseId: 'demo_pur_1',
      batchNo: 'B-CHANDNI-02',
      supplierId: 'demo_sup_1',
      unitCost: 540,
      initialQty: 30,
      remainingQty: 30,
      purchaseDate: y3,
    },
    {
      id: 'demo_bat_3',
      productId: 'demo_prod_charger',
      purchaseId: 'demo_pur_1',
      batchNo: 'B-VOLT-09',
      supplierId: 'demo_sup_1',
      unitCost: 460,
      initialQty: 24,
      remainingQty: 14,
      purchaseDate: y6,
    },
    {
      id: 'demo_bat_4',
      productId: 'demo_prod_powerbank',
      purchaseId: 'demo_pur_1',
      batchNo: 'B-SLIM-04',
      supplierId: 'demo_sup_2',
      unitCost: 780,
      initialQty: 30,
      remainingQty: 26,
      purchaseDate: y3,
    },
  ];
  for (const b of batches) {
    batch.set(doc(db, 'stock_batches', b.id), {
      ...b,
      orgId: ORG_ID,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
    });
  }

  // 4. Demo Suppliers
  const suppliers = [
    {
      id: 'demo_sup_1',
      name: '[DEMO] Chandni Telecom Distributors',
      contactPerson: 'Subhajit Chatterjee',
      phone: '9830145620',
      address: 'Chandni Chowk Market, Kolkata 700072',
      gstin: '19AAACC4120K1Z2',
      openingBalance: 12000,
      totalPurchases: 49200,
      totalPayments: 32000,
      totalReturns: 0,
      outstandingPayable: 29200,
      status: 'active',
    },
    {
      id: 'demo_sup_2',
      name: '[DEMO] Medinipur Electro Hub',
      contactPerson: 'Anirban Jana',
      phone: '9434088112',
      address: 'Station Road, Kharagpur, Paschim Medinipur',
      gstin: '19BBDPM9021L1Z8',
      openingBalance: 5000,
      totalPurchases: 31200,
      totalPayments: 25000,
      totalReturns: 1560,
      outstandingPayable: 9640,
      status: 'active',
    },
  ];
  for (const s of suppliers) {
    batch.set(doc(db, 'suppliers', s.id), {
      ...s,
      orgId: ORG_ID,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
    });
  }

  // 5. Demo Retail Shops across Paschim Medinipur
  const shops = [
    {
      id: 'demo_shop_1',
      shopName: '[DEMO] Ma Tara Mobile & Electronics',
      ownerName: 'Tapas Maity',
      mobile: '9733120045',
      whatsapp: '9733120045',
      address: 'Near Dantan Bus Stand',
      villageTown: 'Dantan',
      blockArea: 'Dantan-I',
      district: 'Paschim Medinipur',
      route: 'NH-16 Dantan-Belda Route',
      openingBalance: 4500,
      creditLimit: 25000,
      totalPurchases: 20700,
      totalPayments: 12000,
      totalReturns: 0,
      totalCreditNotes: 0,
      currentOutstanding: 13200,
      lastDeliveryDate: today,
      status: 'active',
    },
    {
      id: 'demo_shop_2',
      shopName: '[DEMO] Belda Digital Care',
      ownerName: 'Soumen Ghosh',
      mobile: '9800452190',
      whatsapp: '9800452190',
      address: 'Belda College Road',
      villageTown: 'Belda',
      blockArea: 'Narayangarh',
      district: 'Paschim Medinipur',
      route: 'NH-16 Dantan-Belda Route',
      openingBalance: 2000,
      creditLimit: 18000,
      totalPurchases: 19200,
      totalPayments: 5000,
      totalReturns: 0,
      totalCreditNotes: 0,
      currentOutstanding: 16200,
      lastDeliveryDate: y1,
      status: 'active',
    },
    {
      id: 'demo_shop_3',
      shopName: '[DEMO] Mohanpur Mobile Plaza',
      ownerName: 'Rakesh Patra',
      mobile: '9647189230',
      whatsapp: '9647189230',
      address: 'Mohanpur Bazar',
      villageTown: 'Mohanpur',
      blockArea: 'Mohanpur',
      district: 'Paschim Medinipur',
      route: 'Dantan-Mohanpur-Egra Route',
      openingBalance: 8000,
      creditLimit: 15000,
      totalPurchases: 14500,
      totalPayments: 4000,
      totalReturns: 690,
      totalCreditNotes: 0,
      currentOutstanding: 17810, // Exceeds 15000 credit limit alert!
      lastDeliveryDate: y3,
      status: 'active',
    },
  ];
  for (const sh of shops) {
    batch.set(doc(db, 'shops', sh.id), {
      ...sh,
      orgId: ORG_ID,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
    });
  }

  // 6. Demo Purchases (1 Warehouse, 1 Direct-to-Shop)
  batch.set(doc(db, 'purchases', 'demo_pur_1'), {
    invoiceNumber: 'DEMO-SUP-1001',
    supplierId: 'demo_sup_1',
    supplierName: '[DEMO] Chandni Telecom Distributors',
    purchaseDate: y6,
    purchaseType: 'warehouse',
    itemCount: 2,
    subtotal: 26640,
    discount: 0,
    additionalExpenses: 400,
    totalCost: 27040,
    amountPaid: 20000,
    remainingDue: 7040,
    status: 'partial',
    notes: '[DEMO] Initial warehouse stock replenishment',
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    createdByName: actor.displayName,
  });

  batch.set(doc(db, 'purchase_items', 'demo_pi_1'), {
    purchaseId: 'demo_pur_1',
    productId: 'demo_prod_earbuds',
    productName: '[DEMO] AuraPods Pro TWS Earbuds',
    sku: 'PDP-TWS-101',
    unit: 'Piece',
    qty: 30,
    unitRate: 520,
    lineTotal: 15600,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    createdBy: actor.uid,
  });

  batch.set(doc(db, 'purchase_items', 'demo_pi_2'), {
    purchaseId: 'demo_pur_1',
    productId: 'demo_prod_charger',
    productName: '[DEMO] 65W GaN Dual-Port Fast Charger',
    sku: 'PDP-CHG-204',
    unit: 'Piece',
    qty: 24,
    unitRate: 460,
    lineTotal: 11040,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    createdBy: actor.uid,
  });

  // Direct-to-shop linked purchase + sale
  batch.set(doc(db, 'purchases', 'demo_pur_2'), {
    invoiceNumber: 'DEMO-DIR-2001',
    supplierId: 'demo_sup_2',
    supplierName: '[DEMO] Medinipur Electro Hub',
    purchaseDate: y1,
    purchaseType: 'direct_to_shop',
    targetShopId: 'demo_shop_2',
    targetShopName: '[DEMO] Belda Digital Care',
    linkedSaleId: 'demo_sale_2',
    itemCount: 1,
    subtotal: 15600,
    discount: 0,
    additionalExpenses: 0,
    totalCost: 15600,
    amountPaid: 10000,
    remainingDue: 5600,
    status: 'partial',
    notes: '[DEMO] Direct dispatch from supplier to Belda Digital Care',
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    createdByName: actor.displayName,
  });

  batch.set(doc(db, 'purchase_items', 'demo_pi_3'), {
    purchaseId: 'demo_pur_2',
    productId: 'demo_prod_powerbank',
    productName: '[DEMO] SlimPower 20000mAh Digital Power Bank',
    sku: 'PDP-PB-305',
    unit: 'Piece',
    qty: 20,
    unitRate: 780,
    lineTotal: 15600,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    createdBy: actor.uid,
  });

  // 7. Demo Sales (1 Warehouse Dispatch, 1 Direct Supplier Dispatch, 1 Partial Delivery)
  batch.set(doc(db, 'sales', 'demo_sale_1'), {
    invoiceNumber: 'DEMO-INV-001',
    deliveryMethod: 'warehouse_dispatch',
    shopId: 'demo_shop_1',
    shopName: '[DEMO] Ma Tara Mobile & Electronics',
    shopBlock: 'Dantan-I',
    shopDistrict: 'Paschim Medinipur',
    saleDate: today,
    deliveryStatus: 'delivered',
    itemCount: 2,
    subtotal: 12850,
    discount: 250,
    transportExpense: 150,
    netTotal: 12750,
    totalCost: 9800,
    grossProfit: 2950,
    paymentReceived: 8000,
    remainingDue: 4750,
    notes: '[DEMO] Delivered via Dantan local van',
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    createdByName: actor.displayName,
  });

  batch.set(doc(db, 'sale_items', 'demo_si_1'), {
    saleId: 'demo_sale_1',
    productId: 'demo_prod_earbuds',
    productName: '[DEMO] AuraPods Pro TWS Earbuds',
    sku: 'PDP-TWS-101',
    unit: 'Piece',
    orderedQty: 10,
    deliveredQty: 10,
    unitCost: 520,
    sellingPrice: 690,
    lineTotal: 6900,
    lineCost: 5200,
    lineProfit: 1700,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
  });

  batch.set(doc(db, 'sale_items', 'demo_si_2'), {
    saleId: 'demo_sale_1',
    productId: 'demo_prod_charger',
    productName: '[DEMO] 65W GaN Dual-Port Fast Charger',
    sku: 'PDP-CHG-204',
    unit: 'Piece',
    orderedQty: 10,
    deliveredQty: 10,
    unitCost: 460,
    sellingPrice: 595,
    lineTotal: 5950,
    lineCost: 4600,
    lineProfit: 1350,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
  });

  // Direct Supplier Dispatch Sale
  batch.set(doc(db, 'sales', 'demo_sale_2'), {
    invoiceNumber: 'DEMO-DIR-002',
    deliveryMethod: 'direct_supplier_dispatch',
    shopId: 'demo_shop_2',
    shopName: '[DEMO] Belda Digital Care',
    shopBlock: 'Narayangarh',
    shopDistrict: 'Paschim Medinipur',
    supplierId: 'demo_sup_2',
    supplierName: '[DEMO] Medinipur Electro Hub',
    supplierInvoiceNo: 'DEMO-DIR-2001',
    linkedPurchaseId: 'demo_pur_2',
    saleDate: y1,
    deliveryStatus: 'delivered',
    itemCount: 1,
    subtotal: 19200,
    discount: 0,
    transportExpense: 0,
    netTotal: 19200,
    totalCost: 15600,
    grossProfit: 3600,
    paymentReceived: 5000,
    remainingDue: 14200,
    notes: '[DEMO] Direct supplier-to-shop dispatch',
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    createdByName: actor.displayName,
  });

  batch.set(doc(db, 'sale_items', 'demo_si_3'), {
    saleId: 'demo_sale_2',
    productId: 'demo_prod_powerbank',
    productName: '[DEMO] SlimPower 20000mAh Digital Power Bank',
    sku: 'PDP-PB-305',
    unit: 'Piece',
    orderedQty: 20,
    deliveredQty: 20,
    unitCost: 780,
    sellingPrice: 960,
    lineTotal: 19200,
    lineCost: 15600,
    lineProfit: 3600,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
  });

  // Partial Delivery Sale (triggers pending delivery alert!)
  batch.set(doc(db, 'sales', 'demo_sale_3'), {
    invoiceNumber: 'DEMO-INV-003',
    deliveryMethod: 'warehouse_dispatch',
    shopId: 'demo_shop_3',
    shopName: '[DEMO] Mohanpur Mobile Plaza',
    shopBlock: 'Mohanpur',
    shopDistrict: 'Paschim Medinipur',
    saleDate: y3,
    deliveryStatus: 'partial',
    itemCount: 1,
    subtotal: 13800,
    discount: 0,
    transportExpense: 200,
    netTotal: 14000,
    totalCost: 10400,
    grossProfit: 3600,
    paymentReceived: 4000,
    remainingDue: 10000,
    notes: '[DEMO] 12 pcs delivered, 8 pcs pending next trip',
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    createdByName: actor.displayName,
  });

  batch.set(doc(db, 'sale_items', 'demo_si_4'), {
    saleId: 'demo_sale_3',
    productId: 'demo_prod_earbuds',
    productName: '[DEMO] AuraPods Pro TWS Earbuds',
    sku: 'PDP-TWS-101',
    unit: 'Piece',
    orderedQty: 20,
    deliveredQty: 12,
    unitCost: 520,
    sellingPrice: 690,
    lineTotal: 13800,
    lineCost: 10400,
    lineProfit: 3400,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
  });

  // 8. Demo Payments
  const payments = [
    {
      id: 'demo_pay_1',
      partyType: 'shop',
      partyId: 'demo_shop_1',
      partyName: '[DEMO] Ma Tara Mobile & Electronics',
      receiptNumber: 'DEMO-RCPT-01',
      paymentDate: today,
      amount: 8000,
      method: 'upi',
      paymentKind: 'partial',
      referenceNo: 'UPI-431990128',
      linkedInvoiceId: 'demo_sale_1',
      linkedInvoiceNo: 'DEMO-INV-001',
      notes: '[DEMO] UPI received at delivery',
      status: 'active',
    },
    {
      id: 'demo_pay_2',
      partyType: 'shop',
      partyId: 'demo_shop_2',
      partyName: '[DEMO] Belda Digital Care',
      receiptNumber: 'DEMO-RCPT-02',
      paymentDate: y1,
      amount: 5000,
      method: 'cash',
      paymentKind: 'partial',
      linkedInvoiceId: 'demo_sale_2',
      linkedInvoiceNo: 'DEMO-DIR-002',
      notes: '[DEMO] Cash advance on direct dispatch',
      status: 'active',
    },
    {
      id: 'demo_pay_3',
      partyType: 'supplier',
      partyId: 'demo_sup_1',
      partyName: '[DEMO] Chandni Telecom Distributors',
      receiptNumber: 'DEMO-SUPPAY-01',
      paymentDate: y6,
      amount: 20000,
      method: 'bank_transfer',
      paymentKind: 'partial',
      referenceNo: 'NEFT-8829104',
      linkedInvoiceId: 'demo_pur_1',
      linkedInvoiceNo: 'DEMO-SUP-1001',
      notes: '[DEMO] NEFT partial settlement',
      status: 'active',
    },
  ];
  for (const p of payments) {
    batch.set(doc(db, 'payments', p.id), {
      ...p,
      orgId: ORG_ID,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.uid,
      createdByName: actor.displayName,
    });
  }

  // 9. Demo Stock Movements
  const movements = [
    {
      id: 'demo_mov_1',
      date: y6,
      productId: 'demo_prod_earbuds',
      productName: '[DEMO] AuraPods Pro TWS Earbuds',
      sku: 'PDP-TWS-101',
      qty: 30,
      movementType: 'stock_in',
      direction: 'in',
      referenceType: 'purchase',
      referenceId: 'demo_pur_1',
      referenceNumber: 'DEMO-SUP-1001',
      warehouseZone: 'Main Rack A1',
      notes: '[DEMO] Warehouse purchase inward',
    },
    {
      id: 'demo_mov_2',
      date: today,
      productId: 'demo_prod_earbuds',
      productName: '[DEMO] AuraPods Pro TWS Earbuds',
      sku: 'PDP-TWS-101',
      qty: 10,
      movementType: 'stock_out',
      direction: 'out',
      referenceType: 'sale',
      referenceId: 'demo_sale_1',
      referenceNumber: 'DEMO-INV-001',
      warehouseZone: 'Main Rack A1',
      notes: '[DEMO] Dispatched to Ma Tara Mobile & Electronics',
    },
    {
      id: 'demo_mov_3',
      date: y1,
      productId: 'demo_prod_powerbank',
      productName: '[DEMO] SlimPower 20000mAh Digital Power Bank',
      sku: 'PDP-PB-305',
      qty: 1,
      movementType: 'damaged',
      direction: 'out',
      referenceType: 'warehouse_op',
      referenceNumber: 'DAMAGED',
      warehouseZone: 'Ground Bay B1',
      notes: '[DEMO] Outer casing crack noticed during inspection',
    },
  ];
  for (const m of movements) {
    batch.set(doc(db, 'stock_movements', m.id), {
      ...m,
      orgId: ORG_ID,
      isDemo: true,
      createdAt: now,
      createdBy: actor.uid,
      createdByName: actor.displayName,
    });
  }

  // 10. Demo Return Record
  batch.set(doc(db, 'returns', 'demo_ret_1'), {
    returnNumber: 'DEMO-RET-01',
    returnType: 'shop_return',
    returnDate: y1,
    partyType: 'shop',
    partyId: 'demo_shop_3',
    partyName: '[DEMO] Mohanpur Mobile Plaza',
    productId: 'demo_prod_earbuds',
    productName: '[DEMO] AuraPods Pro TWS Earbuds',
    qty: 1,
    unitValue: 690,
    totalValue: 690,
    condition: 'good_sellable',
    returnedToStock: true,
    reason: '[DEMO] Unopened box returned for exchange',
    linkedInvoiceNo: 'DEMO-INV-003',
    status: 'completed',
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.uid,
    createdByName: actor.displayName,
  });

  // 11. Demo Audit Log
  batch.set(doc(db, 'audit_logs', 'demo_aud_1'), {
    action: 'SEED_DEMO_DATA',
    module: 'settings',
    entityId: 'demo_dataset',
    entityLabel: 'DEMO Dataset',
    details: '[DEMO] Initialized realistic Paschim Medinipur wholesale demonstration dataset',
    userId: actor.uid,
    userName: actor.displayName,
    userRole: actor.role,
    orgId: ORG_ID,
    isDemo: true,
    createdAt: now,
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'demo_seed');
  }
}
