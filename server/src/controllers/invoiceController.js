import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { randomBytes } from 'node:crypto';
import Invoice from '../models/Invoice.js';
import MaterialRequest from '../models/MaterialRequest.js';
import Customer from '../models/Customer.js';
import PurchaseSummary from '../models/PurchaseSummary.js';
import CreditNote from '../models/CreditNote.js';
import { ApiError } from '../utils/ApiError.js';
import Shop from '../models/Shop.js';
import AuditLog from '../models/AuditLog.js';

async function canReadInvoice(invoice, user) {
  if (user.roles.includes('ADMIN')) return true;
  if (user.roles.includes('SHOP_OWNER') && await Shop.exists({ _id: invoice.shopId, ownerUserId: user._id, isActive: true })) return true;
  if (invoice.customerId && await Customer.exists({ _id: invoice.customerId, linkedUserId: user._id })) return true;
  const request = await MaterialRequest.findOne({ _id: invoice.requestId, electricianId: user._id });
  return Boolean(request);
}

export async function downloadInvoicePdf(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid invoice identifier.');
  const invoice = await Invoice.findOne({ _id: req.params.id, status: 'ISSUED' });
  if (!invoice || !(await canReadInvoice(invoice, req.user))) throw new ApiError(404, 'Invoice not found.');

  const document = new PDFDocument({ margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
  document.pipe(res);
  document.fontSize(20).text(invoice.sellerSnapshot?.businessName || 'Electrical shop');
  document.fontSize(10).text(invoice.sellerSnapshot?.contactPhone || '');
  document.moveDown();
  document.fontSize(16).text(`Invoice ${invoice.invoiceNumber}`);
  document.fontSize(10).text(`Material Request: ${invoice.requestId}`);
  document.text(`Issued: ${new Date(invoice.issuedAt).toLocaleDateString('en-IN')}`);
  document.moveDown();
  document.text(`Customer: ${invoice.buyerSnapshot?.name || 'Customer'}`);
  document.text(`Phone: ${invoice.buyerSnapshot?.phone || ''}`);
  document.moveDown();
  invoice.lines.forEach((line) => {
    document.text(`${line.itemName}  |  ${line.quantity} ${line.unit}  |  Rs ${(line.unitPricePaise / 100).toFixed(2)}  |  Rs ${(line.lineTotalPaise / 100).toFixed(2)}`);
  });
  document.moveDown();
  document.fontSize(12).text(`Subtotal: Rs ${(invoice.subtotalPaise / 100).toFixed(2)}`);
  document.text(`Tax: Rs ${(invoice.taxPaise / 100).toFixed(2)}`);
  document.text(`Total: Rs ${(invoice.totalPaise / 100).toFixed(2)}`);
  document.fontSize(9).moveDown().text('This document is an invoice issued by the seller. WireFlow consolidated summaries are not tax invoices.');
  document.end();
}

export async function downloadPurchaseSummaryPdf(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid request identifier.');
  const request = await MaterialRequest.findById(req.params.id);
  if (!request) throw new ApiError(404, 'Material request not found.');
  const linkedCustomer = await Customer.exists({ _id: request.customerId, linkedUserId: req.user._id });
  const canRead = req.user.roles.includes('ADMIN') || request.electricianId.equals(req.user._id) || Boolean(linkedCustomer);
  if (!canRead) throw new ApiError(404, 'Purchase summary not found.');
  const summary = await PurchaseSummary.findOne({ requestId: request._id });
  if (!summary) throw new ApiError(404, 'No purchase summary is available yet.');

  const document = new PDFDocument({ margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${summary.statementNumber}.pdf"`);
  document.pipe(res);
  document.fontSize(20).text('WireFlow Purchase Summary');
  document.fontSize(10).text('Consolidated customer statement - not a tax invoice');
  document.moveDown();
  document.text(`Statement: ${summary.statementNumber}`);
  document.text(`Material Request: ${request.requestCode}`);
  document.text(`Generated: ${new Date(summary.generatedAt).toLocaleDateString('en-IN')}`);
  document.moveDown();
  document.text(`Participating shops: ${summary.shopCount}`);
  document.text(`Subtotal: Rs ${(summary.subtotalPaise / 100).toFixed(2)}`);
  document.text(`Tax: Rs ${(summary.taxPaise / 100).toFixed(2)}`);
  document.text(`Discount: Rs ${(summary.discountPaise / 100).toFixed(2)}`);
  document.fontSize(14).text(`Combined purchase total: Rs ${(summary.totalPaise / 100).toFixed(2)}`);
  document.fontSize(9).moveDown().text('This summary combines issued shop invoices for convenience. Individual shop invoices remain the source documents.');
  document.end();
}

async function ensureCreditNoteForInvoice(invoice) {
  const existingCreditNote = await CreditNote.findOne({ sourceInvoiceId: invoice._id });
  if (existingCreditNote) return existingCreditNote;

  const creditNote = await CreditNote.create({
    creditNoteNumber: `CN-${randomBytes(8).toString('hex').toUpperCase()}`,
    sourceInvoiceId: invoice._id,
    requestId: invoice.requestId,
    orderId: invoice.orderId,
    shopId: invoice.shopId,
    branchId: invoice.branchId,
    customerId: invoice.customerId,
    sellerSnapshot: invoice.sellerSnapshot,
    buyerSnapshot: invoice.buyerSnapshot,
    lines: invoice.lines.map((line) => ({
      requestItemId: line.requestItemId,
      itemName: line.itemName,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPricePaise: line.unitPricePaise,
      lineTotalPaise: line.lineTotalPaise,
    })),
    subtotalPaise: invoice.subtotalPaise,
    taxPaise: invoice.taxPaise,
    discountPaise: invoice.discountPaise,
    totalPaise: invoice.totalPaise,
    reason: 'VOIDED_INVOICE',
    status: 'ISSUED',
    issuedAt: new Date(),
  });

  return creditNote;
}

export async function voidInvoice(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid invoice identifier.');
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, 'Invoice not found.');
  const isAdmin = req.user.roles.includes('ADMIN');
  const ownedShop = req.user.roles.includes('SHOP_OWNER') && await Shop.exists({ _id: invoice.shopId, ownerUserId: req.user._id, isActive: true });
  if (!isAdmin && !ownedShop) throw new ApiError(403, 'You cannot void this invoice.');

  if (invoice.status !== 'VOID') {
    invoice.status = 'VOID';
    await invoice.save();
    await AuditLog.create({ performedBy: req.user._id, action: 'INVOICE_VOIDED', entityType: 'Invoice', entityId: invoice._id, previousData: { status: 'ISSUED' }, newData: { status: 'VOID' }, ipAddress: req.ip });
  }

  const creditNote = await ensureCreditNoteForInvoice(invoice);
  res.json({
    success: true,
    message: 'Invoice voided. A credit note record was created for the correction workflow.',
    data: { invoice, creditNote },
  });
}

export async function getInvoiceCreditNote(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid invoice identifier.');
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new ApiError(404, 'Invoice not found.');
  const isAdmin = req.user.roles.includes('ADMIN');
  const ownedShop = req.user.roles.includes('SHOP_OWNER') && await Shop.exists({ _id: invoice.shopId, ownerUserId: req.user._id, isActive: true });
  if (!isAdmin && !ownedShop && !(invoice.customerId && await Customer.exists({ _id: invoice.customerId, linkedUserId: req.user._id }))) {
    throw new ApiError(403, 'You cannot access this invoice credit note.');
  }

  const creditNote = await ensureCreditNoteForInvoice(invoice);
  res.json({ success: true, data: { creditNote } });
}

export async function reissueInvoice(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid invoice identifier.');
  const originalInvoice = await Invoice.findById(req.params.id);
  if (!originalInvoice) throw new ApiError(404, 'Invoice not found.');
  const isAdmin = req.user.roles.includes('ADMIN');
  const ownedShop = req.user.roles.includes('SHOP_OWNER') && await Shop.exists({ _id: originalInvoice.shopId, ownerUserId: req.user._id, isActive: true });
  if (!isAdmin && !ownedShop) throw new ApiError(403, 'You cannot reissue this invoice.');
  if (originalInvoice.status === 'VOID' && originalInvoice.replacesInvoiceId) {
    const corrected = await Invoice.findOne({ _id: originalInvoice.replacesInvoiceId, status: 'ISSUED' });
    if (corrected) return res.json({ success: true, data: { invoice: corrected } });
  }

  const replacementLines = Array.isArray(req.body?.lines) && req.body.lines.length
    ? req.body.lines.map((line) => ({
        requestItemId: line.requestItemId || undefined,
        itemName: line.itemName || 'Item',
        quantity: Number(line.quantity || 0),
        unit: line.unit || 'PCS',
        unitPricePaise: Number(line.unitPricePaise || 0),
        lineTotalPaise: Number(line.lineTotalPaise || line.quantity * line.unitPricePaise || 0),
      }))
    : originalInvoice.lines.map((line) => ({
        requestItemId: line.requestItemId,
        itemName: line.itemName,
        quantity: line.quantity,
        unit: line.unit,
        unitPricePaise: line.unitPricePaise,
        lineTotalPaise: line.lineTotalPaise,
      }));

  const subtotalPaise = replacementLines.reduce((total, line) => total + Number(line.lineTotalPaise || 0), 0);
  const correctedInvoice = await Invoice.create({
    invoiceNumber: `INV-${randomBytes(8).toString('hex').toUpperCase()}`,
    requestId: originalInvoice.requestId,
    orderId: originalInvoice.orderId,
    shopId: originalInvoice.shopId,
    branchId: originalInvoice.branchId,
    customerId: originalInvoice.customerId,
    sellerSnapshot: originalInvoice.sellerSnapshot,
    buyerSnapshot: originalInvoice.buyerSnapshot,
    lines: replacementLines,
    subtotalPaise,
    taxPaise: Number(req.body?.taxPaise ?? originalInvoice.taxPaise ?? 0),
    discountPaise: Number(req.body?.discountPaise ?? originalInvoice.discountPaise ?? 0),
    totalPaise: subtotalPaise + (Number(req.body?.taxPaise ?? originalInvoice.taxPaise ?? 0)) - (Number(req.body?.discountPaise ?? originalInvoice.discountPaise ?? 0)),
    status: 'ISSUED',
    issuedAt: new Date(),
    replacesInvoiceId: originalInvoice._id,
    correctionReason: String(req.body?.reason || 'VOIDED_INVOICE'),
    issueType: 'CORRECTION',
  });

  originalInvoice.status = 'VOID';
  originalInvoice.correctionReason = String(req.body?.reason || 'VOIDED_INVOICE');
  originalInvoice.replacesInvoiceId = correctedInvoice._id;
  await originalInvoice.save();

  await AuditLog.create({
    performedBy: req.user._id,
    action: 'INVOICE_REISSUED',
    entityType: 'Invoice',
    entityId: correctedInvoice._id,
    previousData: { originalInvoiceId: originalInvoice._id, status: 'ISSUED' },
    newData: { correctedInvoiceId: correctedInvoice._id, status: 'ISSUED' },
    ipAddress: req.ip,
  });

  res.status(201).json({ success: true, data: { invoice: correctedInvoice } });
}

