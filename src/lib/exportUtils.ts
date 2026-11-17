import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateDDMMYYYY } from './formatters';
import type { AppSettings, Payment, Sale, SaleItem, Shop } from '../types/erp';

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
  doc.setTextColor(15, 23, 42);
  doc.text(business?.businessName || 'Pramanik Digital Point', 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(business?.location || 'Singda, Dantan, Paschim Medinipur, West Bengal', 14, 21);

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
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
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

  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(bizName, 14, 12);
  doc.setFontSize(9);
  doc.text(bizLoc, 14, 18);
  if (business?.phone || business?.gstin) {
    doc.text(
      `${business?.phone ? `Ph: ${business.phone}  ` : ''}${business?.gstin ? `GSTIN: ${business.gstin}` : ''}`,
      14,
      23
    );
  }

  doc.setFontSize(13);
  doc.text('WHOLESALE INVOICE / CHALLAN', 196, 13, { align: 'right' });
  doc.setFontSize(9);
  doc.text(`Invoice: ${sale.invoiceNumber}`, 196, 19, { align: 'right' });
  doc.text(`Date: ${formatDateDDMMYYYY(sale.saleDate)}`, 196, 24, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text('Bill To:', 14, 38);
  doc.setFontSize(11);
  doc.text(sale.shopName, 14, 44);
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (shop) {
    doc.text(`Owner: ${shop.ownerName} | Ph: ${shop.mobile}`, 14, 49);
    doc.text(`${shop.villageTown}, ${shop.blockArea}, ${shop.district}`, 14, 54);
  } else {
    doc.text(`${sale.shopBlock || ''}, ${sale.shopDistrict || 'Paschim Medinipur'}`, 14, 49);
  }

  doc.text(
    `Dispatch: ${
      sale.deliveryMethod === 'warehouse_dispatch'
        ? 'Central Warehouse'
        : `Direct Supplier (${sale.supplierName || '-'})`
    }`,
    196,
    44,
    { align: 'right' }
  );
  doc.text(`Status: ${sale.deliveryStatus.toUpperCase()}`, 196, 49, { align: 'right' });
  doc.text(`Prepared By: ${sale.createdByName}`, 196, 54, { align: 'right' });

  autoTable(doc, {
    startY: 62,
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
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255 },
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

  doc.setFontSize(11);
  doc.text('Net Invoice Total:', summaryX, finalY + 20);
  doc.text(formatNumPDF(sale.netTotal), 196, finalY + 20, { align: 'right' });

  doc.setFontSize(9.5);
  doc.text('Payment Received:', summaryX, finalY + 27);
  doc.text(formatNumPDF(sale.paymentReceived), 196, finalY + 27, { align: 'right' });
  doc.setTextColor(185, 28, 28);
  doc.text('Balance Due:', summaryX, finalY + 33);
  doc.text(formatNumPDF(sale.remainingDue), 196, finalY + 33, { align: 'right' });

  if (sale.notes) {
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(8.5);
    doc.text(`Notes: ${sale.notes}`, 14, finalY + 12);
  }

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('Thank you for your business — Pramanik Digital Point', 14, 282);

  doc.save(`${sale.invoiceNumber}.pdf`);
}

export function generatePaymentReceiptPDF(payment: Payment, business?: AppSettings | null): void {
  const doc = new jsPDF();
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(business?.businessName || 'Pramanik Digital Point', 14, 11);
  doc.setFontSize(9);
  doc.text(business?.location || 'Singda, Dantan, Paschim Medinipur', 14, 18);
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

export function buildWhatsAppInvoiceLink(sale: Sale, items: SaleItem[], shop?: Shop | null): string {
  const rawPhone = (shop?.whatsapp || shop?.mobile || '').replace(/\D/g, '');
  const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
  const itemLines = items
    .map((it, i) => `${i + 1}. ${it.productName} (${it.deliveredQty} ${it.unit}) - Rs.${it.lineTotal}`)
    .join('\n');
  const msg = [
    `*PRAMANIK DIGITAL POINT*`,
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
