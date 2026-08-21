/**
 * Helper to generate plain-text customer messages for WhatsApp sharing.
 * Follows clean plain-text format (no HTML, no Markdown asterisks, no technical metadata).
 */
export function formatWhatsAppInvoiceMessage(
  customerLegalName: string,
  shareUrl: string
): string {
  const cleanName = (customerLegalName || "Cliente").trim();
  return `Estimado/a ${cleanName}, adjuntamos su factura.\n\nAgradecemos su preferencia.\n\n${shareUrl}`;
}
