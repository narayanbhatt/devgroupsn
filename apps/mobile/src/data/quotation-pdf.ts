import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { fetchEnquiry, fetchQuotation } from '@/data/enquiries';
import { quotationHtml, type QuotationDoc } from '@/lib/quotation-html';
import { supabase } from '@/lib/supabase';

async function buildDoc(quotationId: string): Promise<QuotationDoc> {
  const q = await fetchQuotation(quotationId);
  if (!q) throw new Error('Quotation not found.');
  const [enquiry, cfg] = await Promise.all([
    fetchEnquiry(q.enquiryId),
    supabase!.from('app_config').select('value').eq('key', 'company_details').maybeSingle(),
  ]);
  return {
    number: q.number,
    version: q.version,
    status: q.status,
    issuedOn: q.sentAt,
    validUntil: q.validUntil,
    company: { name: 'DEV Group', ...((cfg.data?.value as object) ?? {}) },
    customer: {
      name: enquiry?.customerName ?? null,
      organization: enquiry?.organizationName ?? null,
      contactPerson: enquiry?.contactPerson ?? null,
      phone: enquiry?.phone ?? null,
      email: enquiry?.email ?? enquiry?.customerEmail ?? null,
      address: enquiry?.deliveryAddress ?? null,
    },
    enquiryNumber: enquiry?.number ?? null,
    projectName: enquiry?.projectName ?? null,
    projectLocation: enquiry?.projectLocation ?? null,
    procurementReference: enquiry?.procurementReference ?? null,
    items: q.items,
    subtotal: q.subtotal,
    tax: q.tax,
    delivery: q.delivery,
    installation: q.installation,
    otherCharges: q.otherCharges,
    discount: q.discount,
    grandTotal: q.grandTotal,
    terms: q.terms,
    notes: q.notes,
  };
}

/**
 * Makes the quotation PDF on the phone from the quotation saved on the server, then opens
 * the share sheet (save to Files, WhatsApp, email). Drafts are stamped DRAFT.
 */
export async function shareQuotationPdf(quotationId: string): Promise<void> {
  const doc = await buildDoc(quotationId);
  const html = quotationHtml(doc);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this phone.');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `${doc.number}${doc.version > 1 ? ` rev ${doc.version}` : ''}.pdf`,
  });
}
