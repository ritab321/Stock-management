import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateDDMMYYYY, numberToIndianWords } from './formatters';
import type {
  AppSettings,
  BillInvoice,
  BillInvoiceItem,
  Payment,
  PrintFormat,
  Purchase,
  ReturnRecord,
  Sale,
  SaleItem,
  Shop,
  Supplier,
} from '../types/erp';

function formatNumPDF(n: number): string {
  return `Rs. ${(Number(n) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function exportRowsToCSV(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escape = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvContent = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRowsToXLSX(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportTableToPDF(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  business?: AppSettings | null
): void {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.setTextColor(23, 37, 84);
  doc.text(business?.businessName || 'Pramanik Digital Point', 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${business?.location || 'Singda, Dantan, Paschim Medinipur, West Bengal'} | Ph: ${business?.phone || '95933 53980'}`,
    14,
    21
  );

  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  doc.text(title, 14, 30);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, 14, 35);

  autoTable(doc, {
    startY: 40,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c ?? ''))),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [23, 37, 84], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/**
 * Clean White Printable Invoice PDF supporting A4, A5, 80mm Thermal, and 58mm Thermal
 */
export function generateBillInvoicePDF(
  invoice: BillInvoice,
  items: BillInvoiceItem[],
  format: PrintFormat = 'a4',
  shop?: Shop | null,
  business?: AppSettings | null
): void {
  const bizName = (business?.businessName || 'PRAMANIK DIGITAL POINT').toUpperCase();
  const bizLoc = business?.location || 'Singda, Dantan, Paschim Medinipur, West Bengal';
  const bizPhone = business?.phone || '95933 53980';

  if (format === '80mm' || format === '58mm') {
    const widthMm = format === '80mm' ? 80 : 58;
    const estHeight = Math.max(150, 95 + items.length * 14);
    const doc = new jsPDF({ unit: 'mm', format: [widthMm, estHeight] });
    const pad = 4;
    const maxW = widthMm - pad * 2;
    let y = 7;

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(format === '80mm' ? 11 : 9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(bizName, widthMm / 2, y, { align: 'center' });
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(format === '80mm' ? 7.5 : 6.5);
    const locLines = doc.splitTextToSize(bizLoc, maxW);
    doc.text(locLines, widthMm / 2, y, { align: 'center' });
    y += locLines.length * 3.2;
    doc.text(`Ph: ${bizPhone}${business?.gstin ? ` | GST: ${business.gstin}` : ''}`, widthMm / 2, y, {
      align: 'center',
    });
    y += 3.5;
    doc.line(pad, y, widthMm - pad, y);
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text(`BILL: ${invoice.invoiceNumber}`, pad, y);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDateDDMMYYYY(invoice.invoiceDate), widthMm - pad, y, { align: 'right' });
    y += 3.8;
    doc.text(`Shop: ${invoice.shopName}`, pad, y, { maxWidth: maxW });
    y += 3.8;
    if (invoice.shopPhone || shop?.mobile) {
      doc.text(`Mob: ${invoice.shopPhone || shop?.mobile}`, pad, y);
      y += 3.5;
    }
    doc.line(pad, y, widthMm - pad, y);
    y += 3.8;

    doc.setFont('helvetica', 'bold');
    doc.text('Item', pad, y);
    doc.text('Qty x Rate', widthMm - 22, y, { align: 'right' });
    doc.text('Amt', widthMm - pad, y, { align: 'right' });
    y += 2;
    doc.line(pad, y, widthMm - pad, y);
    y += 3.5;
    doc.setFont('helvetica', 'normal');

    for (const it of items) {
      const nameLines = doc.splitTextToSize(it.productName, maxW);
      doc.text(nameLines, pad, y);
      y += nameLines.length * 3.2;
      doc.text(`${it.qty} ${it.unit} x ${it.rate.toFixed(0)}`, pad + 2, y);
      doc.text(it.amount.toFixed(2), widthMm - pad, y, { align: 'right' });
      y += 3.8;
    }

    doc.line(pad, y, widthMm - pad, y);
    y += 4;
    const rowLine = (label: string, val: string, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(label, pad, y);
      doc.text(val, widthMm - pad, y, { align: 'right' });
      y += 3.8;
    };
    rowLine('Subtotal', formatNumPDF(invoice.subtotal));
    if (invoice.discount > 0) rowLine('Discount', `- ${formatNumPDF(invoice.discount)}`);
    if (invoice.transportCharge > 0) rowLine('Transport', formatNumPDF(invoice.transportCharge));
    rowLine('NET TOTAL', formatNumPDF(invoice.netTotal), true);
    rowLine('Prev. Balance', formatNumPDF(invoice.previousOutstanding));
    rowLine('Paid Today', formatNumPDF(invoice.paymentReceived));
    rowLine('Balance Due', formatNumPDF(invoice.remainingDue), true);

    y += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(format === '80mm' ? 6.8 : 6);
    const words = doc.splitTextToSize(numberToIndianWords(invoice.netTotal), maxW);
    doc.text(words, pad, y);
    y += words.length * 3 + 3;
    doc.text('Thank you! Visit Again.', widthMm / 2, y, { align: 'center' });

    doc.save(`${invoice.invoiceNumber}_${format}.pdf`);
    return;
  }

  // Clean White A4 or A5 Formal Invoice
  const isA5 = format === 'a5';
  const doc = new jsPDF({ format: isA5 ? 'a5' : 'a4', orientation: 'portrait' });
  const pageW = isA5 ? 148 : 210;
  const pageH = isA5 ? 210 : 297;
  const m = isA5 ? 10 : 14;

  // Clean white header with crisp navy hairline
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setDrawColor(23, 37, 84);
  doc.setLineWidth(0.6);
  doc.line(m, isA5 ? 28 : 34, pageW - m, isA5 ? 28 : 34);

  doc.setTextColor(23, 37, 84);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA5 ? 13 : 16);
  doc.text(bizName, m, isA5 ? 12 : 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA5 ? 7.5 : 8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(bizLoc, m, isA5 ? 17 : 21);
  doc.text(`Phone: ${bizPhone}${business?.gstin ? `  |  GSTIN: ${business.gstin}` : ''}`, m, isA5 ? 22 : 26);

  doc.setTextColor(23, 37, 84);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA5 ? 11 : 13);
  doc.text(invoice.status === 'draft' ? 'PROFORMA / DRAFT BILL' : 'WHOLESALE TAX / CASH BILL', pageW - m, isA5 ? 12 : 15, {
    align: 'right',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA5 ? 8 : 9);
  doc.text(`Bill No: ${invoice.invoiceNumber}`, pageW - m, isA5 ? 17.5 : 21, { align: 'right' });
  doc.text(`Date: ${formatDateDDMMYYYY(invoice.invoiceDate)}`, pageW - m, isA5 ? 22.5 : 26, { align: 'right' });

  // Customer block
  let y = isA5 ? 34 : 42;
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(isA5 ? 7.5 : 8.5);
  doc.text('BILL TO (RETAIL SHOP):', m, y);
  doc.text('PAYMENT & STATUS:', pageW - m, y, { align: 'right' });
  y += 5;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA5 ? 9.5 : 11);
  doc.text(invoice.shopName, m, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA5 ? 7.8 : 8.8);
  doc.setTextColor(71, 85, 105);
  const custPhone = invoice.shopPhone || shop?.mobile || '-';
  const custAddr =
    invoice.shopAddress ||
    (shop ? [shop.villageTown, shop.town, shop.blockArea, shop.district].filter(Boolean).join(', ') : '-');
  doc.text(`Mobile: ${custPhone}`, m, y + 4.5);
  doc.text(custAddr, m, y + 9, { maxWidth: isA5 ? 75 : 110 });

  doc.text(`Status: ${invoice.status.toUpperCase()} (${invoice.paymentStatus.toUpperCase()})`, pageW - m, y, {
    align: 'right',
  });
  doc.text(`Mode: ${invoice.paymentMethod.replace(/_/g, ' ').toUpperCase()}`, pageW - m, y + 4.5, { align: 'right' });
  doc.text(`Prepared By: ${invoice.createdByName}`, pageW - m, y + 9, { align: 'right' });

  autoTable(doc, {
    startY: y + 16,
    margin: { left: m, right: m },
    head: [['#', 'Product & Description', 'Qty', 'Unit', 'Rate', 'Disc', 'Amount']],
    body: items.map((it, idx) => [
      String(idx + 1),
      it.description ? `${it.productName}\n${it.description}` : `${it.productName} (${it.sku})`,
      String(it.qty),
      it.unit,
      formatNumPDF(it.rate),
      it.discount > 0 ? formatNumPDF(it.discount) : '-',
      formatNumPDF(it.amount),
    ]),
    theme: 'grid',
    styles: {
      fontSize: isA5 ? 7.5 : 8.5,
      cellPadding: isA5 ? 2 : 2.8,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: { fillColor: [248, 250, 252], textColor: [23, 37, 84], fontStyle: 'bold' },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const sumX = isA5 ? pageW - 65 : pageW - 78;

  doc.setFontSize(isA5 ? 8 : 9);
  doc.setTextColor(51, 65, 85);
  doc.text('Subtotal:', sumX, finalY);
  doc.text(formatNumPDF(invoice.subtotal), pageW - m, finalY, { align: 'right' });
  doc.text('Discount:', sumX, finalY + 5);
  doc.text(`- ${formatNumPDF(invoice.discount)}`, pageW - m, finalY + 5, { align: 'right' });
  doc.text('Transport Charge:', sumX, finalY + 10);
  doc.text(formatNumPDF(invoice.transportCharge), pageW - m, finalY + 10, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(sumX, finalY + 13, pageW - m, finalY + 13);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA5 ? 9.5 : 10.5);
  doc.setTextColor(23, 37, 84);
  doc.text('Net Invoice Total:', sumX, finalY + 18);
  doc.text(formatNumPDF(invoice.netTotal), pageW - m, finalY + 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA5 ? 8 : 8.8);
  doc.setTextColor(51, 65, 85);
  doc.text('Prev. Outstanding:', sumX, finalY + 24);
  doc.text(formatNumPDF(invoice.previousOutstanding), pageW - m, finalY + 24, { align: 'right' });
  doc.text('Payment Received:', sumX, finalY + 29);
  doc.text(formatNumPDF(invoice.paymentReceived), pageW - m, finalY + 29, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(invoice.remainingDue > 0 ? 185 : 22, invoice.remainingDue > 0 ? 28 : 163, invoice.remainingDue > 0 ? 28 : 74);
  doc.text('Bill Balance Due:', sumX, finalY + 34.5);
  doc.text(formatNumPDF(invoice.remainingDue), pageW - m, finalY + 34.5, { align: 'right' });

  // Amount in words & Notes on left
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA5 ? 7.5 : 8.5);
  doc.setTextColor(23, 37, 84);
  doc.text('Amount in Words:', m, finalY + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  const words = doc.splitTextToSize(numberToIndianWords(invoice.netTotal), sumX - m - 8);
  doc.text(words, m, finalY + 7);
  if (invoice.notes) {
    doc.text(`Notes: ${invoice.notes}`, m, finalY + 18, { maxWidth: sumX - m - 8 });
  }

  // Signature footer
  const sigY = Math.min(pageH - 16, finalY + 52);
  doc.setDrawColor(148, 163, 184);
  doc.line(m, sigY - 5, m + 42, sigY - 5);
  doc.line(pageW - m - 46, sigY - 5, pageW - m, sigY - 5);
  doc.setFontSize(isA5 ? 7 : 8);
  doc.setTextColor(100, 116, 139);
  doc.text('Receiver Signature', m, sigY);
  doc.text('Authorized Signature (Pramanik Digital Point)', pageW - m, sigY, { align: 'right' });

  doc.save(`${invoice.invoiceNumber}_${format}.pdf`);
}

export function generateSaleInvoicePDF(
  sale: Sale,
  items: SaleItem[],
  shop?: Shop | null,
  business?: AppSettings | null
): void {
  const doc = new jsPDF();
  const bizName = business?.businessName || 'Pramanik Digital Point';
  const bizLoc = business?.location || 'Singda, Dantan, Paschim Medinipur, West Bengal';
  const bizPhone = business?.phone || '95933 53980';

  // Clean White Printable Invoice
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setDrawColor(23, 37, 84);
  doc.setLineWidth(0.7);
  doc.line(14, 33, 196, 33);

  doc.setTextColor(23, 37, 84);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(bizName.toUpperCase(), 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(bizLoc, 14, 20);
  doc.text(
    `Ph: ${bizPhone}${business?.gstin ? `  |  GSTIN: ${business.gstin}` : ''}`,
    14,
    25
  );

  doc.setTextColor(23, 37, 84);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('WHOLESALE INVOICE / CHALLAN', 196, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Invoice: ${sale.invoiceNumber}`, 196, 20, { align: 'right' });
  doc.text(`Date: ${formatDateDDMMYYYY(sale.saleDate)}`, 196, 25, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text('Bill To:', 14, 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(sale.shopName, 14, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (shop) {
    doc.text(`Owner: ${shop.ownerName} | Ph: ${shop.mobile}`, 14, 51);
    doc.text(`${shop.villageTown}, ${shop.blockArea}, ${shop.district}`, 14, 56);
  } else {
    doc.text(`${sale.shopBlock || ''}, ${sale.shopDistrict || 'Paschim Medinipur'}`, 14, 51);
  }

  doc.text(
    `Dispatch: ${
      sale.deliveryMethod === 'warehouse_dispatch'
        ? 'Central Warehouse'
        : `Direct Supplier (${sale.supplierName || '-'})`
    }`,
    196,
    46,
    { align: 'right' }
  );
  doc.text(`Status: ${sale.deliveryStatus.toUpperCase()}`, 196, 51, { align: 'right' });
  doc.text(`Prepared By: ${sale.createdByName}`, 196, 56, { align: 'right' });

  autoTable(doc, {
    startY: 63,
    head: [['#', 'Product', 'SKU', 'Ordered', 'Delivered', 'Rate', 'Amount']],
    body: items.map((it, idx) => [
      String(idx + 1),
      it.productName,
      it.sku,
      `${it.orderedQty} ${it.unit}`,
      `${it.deliveredQty} ${it.unit}`,
      formatNumPDF(it.sellingPrice),
      formatNumPDF(it.lineTotal),
    ]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3, textColor: [15, 23, 42] },
    headStyles: { fillColor: [248, 250, 252], textColor: [23, 37, 84], fontStyle: 'bold' },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const summaryX = 135;
  doc.text('Subtotal:', summaryX, finalY);
  doc.text(formatNumPDF(sale.subtotal), 196, finalY, { align: 'right' });
  doc.text('Discount:', summaryX, finalY + 6);
  doc.text(`- ${formatNumPDF(sale.discount)}`, 196, finalY + 6, { align: 'right' });
  doc.text('Transport / Delivery:', summaryX, finalY + 12);
  doc.text(formatNumPDF(sale.transportExpense), 196, finalY + 12, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Net Invoice Total:', summaryX, finalY + 20);
  doc.text(formatNumPDF(sale.netTotal), 196, finalY + 20, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Payment Received:', summaryX, finalY + 27);
  doc.text(formatNumPDF(sale.paymentReceived), 196, finalY + 27, { align: 'right' });
  doc.setTextColor(185, 28, 28);
  doc.text('Balance Due:', summaryX, finalY + 33);
  doc.text(formatNumPDF(sale.remainingDue), 196, finalY + 33, { align: 'right' });

  doc.setTextColor(23, 37, 84);
  doc.setFontSize(8.5);
  doc.text(`Amount in Words: ${numberToIndianWords(sale.netTotal)}`, 14, finalY + 6, { maxWidth: 112 });
  if (sale.notes) {
    doc.setTextColor(71, 85, 105);
    doc.text(`Notes: ${sale.notes}`, 14, finalY + 18, { maxWidth: 112 });
  }

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('Authorized Signature — Pramanik Digital Point', 196, 282, { align: 'right' });
  doc.text(`Contact: ${bizPhone}`, 14, 282);

  doc.save(`${sale.invoiceNumber}.pdf`);
}

export function generatePaymentReceiptPDF(payment: Payment, business?: AppSettings | null): void {
  const doc = new jsPDF();
  doc.setDrawColor(23, 37, 84);
  doc.setLineWidth(0.6);
  doc.line(14, 28, 196, 28);
  doc.setTextColor(23, 37, 84);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(business?.businessName || 'Pramanik Digital Point', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${business?.location || 'Singda, Dantan, Paschim Medinipur'} | Ph: ${business?.phone || '95933 53980'}`,
    14,
    20
  );
  doc.setTextColor(23, 37, 84);
  doc.text(`RECEIPT: ${payment.receiptNumber}`, 196, 14, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(payment.partyType === 'shop' ? 'Customer Payment Receipt' : 'Supplier Payment Voucher', 14, 38);

  autoTable(doc, {
    startY: 44,
    body: [
      ['Receipt Number', payment.receiptNumber],
      ['Date', formatDateDDMMYYYY(payment.paymentDate)],
      [payment.partyType === 'shop' ? 'Shop / Customer' : 'Supplier', payment.partyName],
      ['Payment Type', payment.paymentKind.replace(/_/g, ' ').toUpperCase()],
      ['Method', payment.method.replace(/_/g, ' ').toUpperCase()],
      ['Amount', formatNumPDF(payment.amount)],
      ['Amount in Words', numberToIndianWords(payment.amount)],
      ['Reference / UTR', payment.referenceNo || '-'],
      ['Linked Invoice', payment.linkedInvoiceNo || '-'],
      ['Status', payment.status.toUpperCase()],
      ['Recorded By', payment.createdByName],
      ['Notes', payment.notes || '-'],
    ],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 3.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] } },
  });

  doc.save(`${payment.receiptNumber}.pdf`);
}

export function generateShopLedgerPDF(
  shop: Shop,
  sales: Sale[],
  invoices: BillInvoice[],
  payments: Payment[],
  returns: ReturnRecord[],
  business?: AppSettings | null
): void {
  const rows: Array<{ date: string; ref: string; desc: string; debit: number; credit: number }> = [];
  sales
    .filter((s) => s.shopId === shop.id && s.deliveryStatus !== 'reversed')
    .forEach((s) => rows.push({ date: s.saleDate, ref: s.invoiceNumber, desc: 'Sales Dispatch', debit: s.netTotal, credit: 0 }));
  invoices
    .filter((inv) => inv.shopId === shop.id && inv.status === 'confirmed')
    .forEach((inv) => rows.push({ date: inv.invoiceDate, ref: inv.invoiceNumber, desc: 'Bill Book Invoice', debit: inv.netTotal, credit: 0 }));
  payments
    .filter((p) => p.partyType === 'shop' && p.partyId === shop.id && p.status === 'active')
    .forEach((p) =>
      rows.push({
        date: p.paymentDate,
        ref: p.receiptNumber,
        desc: `Payment (${p.method.toUpperCase()})`,
        debit: p.paymentKind === 'refund' ? p.amount : 0,
        credit: p.paymentKind === 'refund' ? 0 : p.amount,
      })
    );
  returns
    .filter((r) => r.partyType === 'shop' && r.partyId === shop.id && r.status === 'completed')
    .forEach((r) => rows.push({ date: r.returnDate, ref: r.returnNumber, desc: 'Return Credit', debit: 0, credit: r.totalValue }));

  rows.sort((a, b) => a.date.localeCompare(b.date));
  let running = shop.openingBalance;
  const tableRows: Array<Array<string | number>> = [
    ['Opening', '-', 'Opening Balance', formatNumPDF(shop.openingBalance > 0 ? shop.openingBalance : 0), '-', formatNumPDF(running)],
  ];
  for (const r of rows) {
    running = running + r.debit - r.credit;
    tableRows.push([
      formatDateDDMMYYYY(r.date),
      r.ref,
      r.desc,
      r.debit ? formatNumPDF(r.debit) : '-',
      r.credit ? formatNumPDF(r.credit) : '-',
      formatNumPDF(running),
    ]);
  }

  exportTableToPDF(
    `shop_ledger_${shop.shopName.replace(/\s+/g, '_')}`,
    `Customer Ledger Statement: ${shop.shopName}`,
    `Owner: ${shop.ownerName} | Ph: ${shop.mobile} | Area: ${shop.villageTown}, ${shop.blockArea}`,
    ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'],
    tableRows,
    business
  );
}

export function generateSupplierStatementPDF(
  supplier: Supplier,
  purchases: Purchase[],
  payments: Payment[],
  returns: ReturnRecord[],
  business?: AppSettings | null
): void {
  const rows: Array<{ date: string; ref: string; desc: string; debit: number; credit: number }> = [];
  purchases
    .filter((p) => p.supplierId === supplier.id && p.status !== 'reversed')
    .forEach((p) => rows.push({ date: p.purchaseDate, ref: p.invoiceNumber, desc: `Purchase (${p.purchaseType})`, debit: 0, credit: p.totalCost }));
  payments
    .filter((p) => p.partyType === 'supplier' && p.partyId === supplier.id && p.status === 'active')
    .forEach((p) =>
      rows.push({
        date: p.paymentDate,
        ref: p.receiptNumber,
        desc: `Payment (${p.method.toUpperCase()})`,
        debit: p.paymentKind === 'refund' ? 0 : p.amount,
        credit: p.paymentKind === 'refund' ? p.amount : 0,
      })
    );
  returns
    .filter((r) => r.partyType === 'supplier' && r.partyId === supplier.id && r.status === 'completed')
    .forEach((r) => rows.push({ date: r.returnDate, ref: r.returnNumber, desc: 'Supplier Return', debit: r.totalValue, credit: 0 }));

  rows.sort((a, b) => a.date.localeCompare(b.date));
  let running = supplier.openingBalance;
  const tableRows: Array<Array<string | number>> = [
    ['Opening', '-', 'Opening Balance Payable', '-', formatNumPDF(supplier.openingBalance), formatNumPDF(running)],
  ];
  for (const r of rows) {
    running = running + r.credit - r.debit;
    tableRows.push([
      formatDateDDMMYYYY(r.date),
      r.ref,
      r.desc,
      r.debit ? formatNumPDF(r.debit) : '-',
      r.credit ? formatNumPDF(r.credit) : '-',
      formatNumPDF(running),
    ]);
  }

  exportTableToPDF(
    `supplier_statement_${supplier.name.replace(/\s+/g, '_')}`,
    `Supplier Statement: ${supplier.name}`,
    `Contact: ${supplier.contactPerson || '-'} | Ph: ${supplier.phone}${supplier.gstin ? ` | GSTIN: ${supplier.gstin}` : ''}`,
    ['Date', 'Reference', 'Description', 'Paid / Debit', 'Billed / Credit', 'Payable Bal'],
    tableRows,
    business
  );
}

export function buildWhatsAppInvoiceLink(sale: Sale, items: SaleItem[], shop?: Shop | null): string {
  const rawPhone = (shop?.whatsapp || shop?.mobile || '').replace(/\D/g, '');
  const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
  const itemLines = items
    .map((it, i) => `${i + 1}. ${it.productName} (${it.deliveredQty} ${it.unit}) - Rs.${it.lineTotal}`)
    .join('\n');
  const msg = [
    `*PRAMANIK DIGITAL POINT* (Ph: 95933 53980)`,
    `Invoice: *${sale.invoiceNumber}*`,
    `Date: ${formatDateDDMMYYYY(sale.saleDate)}`,
    `Shop: ${sale.shopName}`,
    ``,
    `*Items:*`,
    itemLines,
    ``,
    `Net Total: *Rs.${sale.netTotal.toFixed(2)}*`,
    `Paid: Rs.${sale.paymentReceived.toFixed(2)}`,
    `Balance Due: *Rs.${sale.remainingDue.toFixed(2)}*`,
  ].join('\n');
  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function buildWhatsAppBillLink(
  invoice: BillInvoice,
  items: BillInvoiceItem[],
  shop?: Shop | null
): string {
  const rawPhone = (shop?.whatsapp || shop?.mobile || invoice.shopPhone || '').replace(/\D/g, '');
  const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
  const itemLines = items
    .map((it, i) => `${i + 1}. ${it.productName} (${it.qty} ${it.unit} x Rs.${it.rate}) = Rs.${it.amount}`)
    .join('\n');
  const msg = [
    `*PRAMANIK DIGITAL POINT*`,
    `Singda, Dantan, Paschim Medinipur | Ph: 95933 53980`,
    `Bill No: *${invoice.invoiceNumber}*`,
    `Date: ${formatDateDDMMYYYY(invoice.invoiceDate)}`,
    `Shop: ${invoice.shopName}`,
    ``,
    `*Items:*`,
    itemLines,
    ``,
    `Net Total: *Rs.${invoice.netTotal.toFixed(2)}*`,
    `Paid: Rs.${invoice.paymentReceived.toFixed(2)}`,
    `Balance Due: *Rs.${invoice.remainingDue.toFixed(2)}*`,
  ].join('\n');
  const encoded = encodeURIComponent(msg);
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}
