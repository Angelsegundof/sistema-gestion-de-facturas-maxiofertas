/**
 * Helper to generate plain-text customer messages for WhatsApp sharing.
 * Follows clean plain-text format (no HTML, no Markdown asterisks, no technical metadata).
 * Supports single-document invoices and split-invoices (multiple tax documents).
 */
export function formatWhatsAppInvoiceMessage(
  customerLegalName: string,
  shareUrls: string | Array<string | { documentNumber?: number; url: string }>
): string {
  const cleanName = (customerLegalName || "Cliente").trim();

  // Single URL string
  if (typeof shareUrls === "string") {
    return `Estimado/a ${cleanName}:\n\nAdjuntamos su factura correspondiente a su compra.\n\n${shareUrls}\n\nAgradecemos su preferencia.\nMaxiofertas`;
  }

  // Array with single entry
  if (Array.isArray(shareUrls) && shareUrls.length === 1) {
    const singleUrl = typeof shareUrls[0] === "string" ? shareUrls[0] : shareUrls[0].url;
    return `Estimado/a ${cleanName}:\n\nAdjuntamos su factura correspondiente a su compra.\n\n${singleUrl}\n\nAgradecemos su preferencia.\nMaxiofertas`;
  }

  // Array with multiple documents
  if (Array.isArray(shareUrls) && shareUrls.length > 1) {
    const formattedDocs = shareUrls
      .map((entry, idx) => {
        const docNum =
          typeof entry === "object" && entry.documentNumber
            ? entry.documentNumber
            : idx + 1;
        const url = typeof entry === "string" ? entry : entry.url;
        return `Factura ${docNum}:\n${url}`;
      })
      .join("\n\n");

    return `Estimado/a ${cleanName}:\n\nAdjuntamos las facturas correspondientes a su compra.\n\n${formattedDocs}\n\nAgradecemos su preferencia.\nMaxiofertas`;
  }

  return `Estimado/a ${cleanName}:\n\nAdjuntamos su factura correspondiente a su compra.\n\nAgradecemos su preferencia.\nMaxiofertas`;
}
