import { describe, it, expect } from "vitest";
import {
  calculateRequiredDocuments,
  splitRequestItemsIntoDocuments,
  calculateRequestTotals,
  MAX_ITEMS_PER_DOCUMENT,
} from "@/domain/pricing";
import { formatWhatsAppInvoiceMessage } from "@/domain/whatsapp";
import { generateInvoiceStorageKey } from "@/lib/services/invoice-documents";
import { SanitizedDocument, SanitizedInvoiceRequestItem } from "@/domain/types";

describe("MEJORA OPERATIVA — Facturación Dividida por Límite de 10 Ítems en SII", () => {
  describe("1. Regla de Conteo de Documentos Requeridos (calculateRequiredDocuments)", () => {
    it("debe calcular ceil(N / 10) para cualquier cantidad de ítems", () => {
      expect(calculateRequiredDocuments(0)).toBe(1);
      expect(calculateRequiredDocuments(1)).toBe(1);
      expect(calculateRequiredDocuments(5)).toBe(1);
      expect(calculateRequiredDocuments(9)).toBe(1);
      expect(calculateRequiredDocuments(10)).toBe(1);
      expect(calculateRequiredDocuments(11)).toBe(2);
      expect(calculateRequiredDocuments(19)).toBe(2);
      expect(calculateRequiredDocuments(20)).toBe(2);
      expect(calculateRequiredDocuments(21)).toBe(3);
      expect(calculateRequiredDocuments(25)).toBe(3);
      expect(calculateRequiredDocuments(30)).toBe(3);
      expect(calculateRequiredDocuments(31)).toBe(4);
    });

    it("la constante MAX_ITEMS_PER_DOCUMENT debe ser 10", () => {
      expect(MAX_ITEMS_PER_DOCUMENT).toBe(10);
    });
  });

  describe("2. Partición Determinística de Ítems (splitRequestItemsIntoDocuments)", () => {
    it("debe particionar 11 ítems en 2 bloques (10 + 1) preservando orden e integridad", () => {
      const rawItems = Array.from({ length: 11 }, (_, i) => ({
        description: `Producto ${i + 1}`,
        quantity: 1,
        unitPriceGross: 10000,
      }));

      const totals = calculateRequestTotals(rawItems);
      const blocks = splitRequestItemsIntoDocuments(totals.items);

      expect(blocks).toHaveLength(2);

      // Bloque 1
      expect(blocks[0].documentNumber).toBe(1);
      expect(blocks[0].totalDocuments).toBe(2);
      expect(blocks[0].itemCount).toBe(10);
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[0].endLine).toBe(10);
      expect(blocks[0].items).toHaveLength(10);
      expect(blocks[0].items[0].description).toBe("Producto 1");
      expect(blocks[0].items[9].description).toBe("Producto 10");
      expect(blocks[0].expectedGrossTotal).toBe(100000);

      // Bloque 2
      expect(blocks[1].documentNumber).toBe(2);
      expect(blocks[1].totalDocuments).toBe(2);
      expect(blocks[1].itemCount).toBe(1);
      expect(blocks[1].startLine).toBe(11);
      expect(blocks[1].endLine).toBe(11);
      expect(blocks[1].items).toHaveLength(1);
      expect(blocks[1].items[0].description).toBe("Producto 11");
      expect(blocks[1].expectedGrossTotal).toBe(10000);

      // Cuadratura de la suma
      const sumGross = blocks.reduce((sum, b) => sum + b.expectedGrossTotal, 0);
      expect(sumGross).toBe(totals.expectedGrossTotal);
      expect(sumGross).toBe(110000);
    });

    it("debe particionar 25 ítems en 3 bloques (10 + 10 + 5)", () => {
      const rawItems = Array.from({ length: 25 }, (_, i) => ({
        description: `Item ${i + 1}`,
        quantity: 2,
        unitPriceGross: 5000,
      }));

      const totals = calculateRequestTotals(rawItems);
      const blocks = splitRequestItemsIntoDocuments(totals.items);

      expect(blocks).toHaveLength(3);
      expect(blocks[0].itemCount).toBe(10);
      expect(blocks[0].startLine).toBe(1);
      expect(blocks[0].endLine).toBe(10);

      expect(blocks[1].itemCount).toBe(10);
      expect(blocks[1].startLine).toBe(11);
      expect(blocks[1].endLine).toBe(20);

      expect(blocks[2].itemCount).toBe(5);
      expect(blocks[2].startLine).toBe(21);
      expect(blocks[2].endLine).toBe(25);

      const totalItemsCount = blocks.reduce((sum, b) => sum + b.itemCount, 0);
      expect(totalItemsCount).toBe(25);

      const sumGross = blocks.reduce((sum, b) => sum + b.expectedGrossTotal, 0);
      expect(sumGross).toBe(totals.expectedGrossTotal);
      expect(sumGross).toBe(250000);
    });

    it("debe asociar correctamente los documentos adjuntos según su documentNumber", () => {
      const rawItems = Array.from({ length: 12 }, (_, i) => ({
        description: `Articulo ${i + 1}`,
        quantity: 1,
        unitPriceGross: 10000,
      }));
      const totals = calculateRequestTotals(rawItems);

      const mockDocs: SanitizedDocument[] = [
        {
          id: "doc-1",
          invoiceRequestId: "req-1",
          documentNumber: 1,
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "key-1.pdf",
          fileName: "factura_doc1.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          uploadedBy: "user-1",
          isVoided: false,
          voidedAt: null,
          createdAt: new Date().toISOString(),
          accessUrl: "https://r2.storage/doc1.pdf",
        },
        {
          id: "doc-2",
          invoiceRequestId: "req-1",
          documentNumber: 2,
          documentType: "INVOICE",
          storageProvider: "R2",
          storageKey: "key-2.pdf",
          fileName: "factura_doc2.pdf",
          fileSize: 2048,
          mimeType: "application/pdf",
          uploadedBy: "user-1",
          isVoided: false,
          voidedAt: null,
          createdAt: new Date().toISOString(),
          accessUrl: "https://r2.storage/doc2.pdf",
        },
      ];

      const blocks = splitRequestItemsIntoDocuments(totals.items, mockDocs);

      expect(blocks[0].document).toBeDefined();
      expect(blocks[0].document?.id).toBe("doc-1");
      expect(blocks[0].document?.fileName).toBe("factura_doc1.pdf");

      expect(blocks[1].document).toBeDefined();
      expect(blocks[1].document?.id).toBe("doc-2");
      expect(blocks[1].document?.fileName).toBe("factura_doc2.pdf");
    });
  });

  describe("3. Generación Determinística de Storage Keys en R2 (generateInvoiceStorageKey)", () => {
    it("debe generar nombre estándar para factura simple de 1 documento", () => {
      const fixedDate = new Date("2026-09-03T14:30:00Z");
      const key = generateInvoiceStorageKey(
        "FAC-2026-000100",
        "76.123.456-7",
        1,
        1,
        fixedDate
      );
      expect(key).toBe("facturas/2026/09/FAC-2026-000100/FAC-2026-000100_761234567.pdf");
    });

    it("debe incluir sufijo _DOC{N}_ cuando la solicitud es dividida (totalDocuments > 1)", () => {
      const fixedDate = new Date("2026-09-03T14:30:00Z");
      const keyDoc1 = generateInvoiceStorageKey(
        "FAC-2026-000120",
        "76.123.456-7",
        1,
        2,
        fixedDate
      );
      const keyDoc2 = generateInvoiceStorageKey(
        "FAC-2026-000120",
        "76.123.456-7",
        2,
        2,
        fixedDate
      );

      expect(keyDoc1).toBe("facturas/2026/09/FAC-2026-000120/FAC-2026-000120_DOC1_761234567.pdf");
      expect(keyDoc2).toBe("facturas/2026/09/FAC-2026-000120/FAC-2026-000120_DOC2_761234567.pdf");
    });
  });

  describe("4. Formato de Mensaje Consolidado para WhatsApp (formatWhatsAppInvoiceMessage)", () => {
    it("debe formatear mensaje simple cuando hay 1 solo documento", () => {
      const msg = formatWhatsAppInvoiceMessage(
        "Maxiofertas SpA",
        "https://maxiofertas.cl/f/abc12345"
      );

      expect(msg).toContain("Estimado/a Maxiofertas SpA:");
      expect(msg).toContain("Adjuntamos su factura correspondiente a su compra.");
      expect(msg).toContain("https://maxiofertas.cl/f/abc12345");
      expect(msg).not.toContain("Factura 1:");
    });

    it("debe formatear mensaje consolidado con lista de enlaces cuando hay múltiples facturas", () => {
      const splitUrls = [
        { documentNumber: 1, url: "https://maxiofertas.cl/f/doc1-url" },
        { documentNumber: 2, url: "https://maxiofertas.cl/f/doc2-url" },
      ];

      const msg = formatWhatsAppInvoiceMessage("Distribuidora Central SpA", splitUrls);

      expect(msg).toContain("Estimado/a Distribuidora Central SpA:");
      expect(msg).toContain("Adjuntamos las facturas correspondientes a su compra.");
      expect(msg).toContain("Factura 1:\nhttps://maxiofertas.cl/f/doc1-url");
      expect(msg).toContain("Factura 2:\nhttps://maxiofertas.cl/f/doc2-url");
      expect(msg).toContain("Agradecemos su preferencia.\nMaxiofertas");
    });
  });
});
