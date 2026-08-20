import { describe, it, expect } from "vitest";
import {
  calculateNetPrice,
  calculateLineItem,
  calculateRequestTotals,
  calculateReconciliation,
  formatCLP,
} from "@/domain/pricing";

describe("Domain Pricing and Exact Integer Rounding Standards (CLP & Modulo Tributario)", () => {
  it("should calculate exact unit net price using exact integer ROUND_HALF_UP arithmetic", () => {
    // 28.000 * 100 / 119 = 2.800.000 / 119 = 23.529,411... -> 23.529
    expect(calculateNetPrice(28000)).toBe(23529);

    // 12.000 * 100 / 119 = 1.200.000 / 119 = 10.084,033... -> 10.084
    expect(calculateNetPrice(12000)).toBe(10084);

    // 119.000 * 100 / 119 = 11.900.000 / 119 = 100.000
    expect(calculateNetPrice(119000)).toBe(100000);

    // 10.000 * 100 / 119 = 1.000.000 / 119 = 8.403,36... -> 8.403
    expect(calculateNetPrice(10000)).toBe(8403);

    // Boundary tests
    expect(calculateNetPrice(1)).toBe(1); // (100 + 59)/119 = 1
    expect(calculateNetPrice(119)).toBe(100);
    expect(calculateNetPrice(118)).toBe(99);
    expect(calculateNetPrice(120)).toBe(101);

    // High monetary amount without overflow
    expect(calculateNetPrice(1000000000)).toBe(840336134);
  });

  it("should reject negative, zero, non-integer or unsafe integer gross prices", () => {
    expect(() => calculateNetPrice(0)).toThrow();
    expect(() => calculateNetPrice(-500)).toThrow();
    expect(() => calculateNetPrice(28000.5)).toThrow();
    expect(() => calculateNetPrice(Number.MAX_SAFE_INTEGER + 10)).toThrow();
  });

  it("should accurately compute structured product lines", () => {
    const line1 = calculateLineItem({ description: "Toldo 3x3", quantity: 2, unitPriceGross: 28000 }, 1);
    expect(line1.lineNumber).toBe(1);
    expect(line1.quantity).toBe(2);
    expect(line1.unitPriceGross).toBe(28000);
    expect(line1.unitPriceNet).toBe(23529);
    expect(line1.lineTotalGross).toBe(56000);
    expect(line1.lineTotalNet).toBe(47058);

    const line2 = calculateLineItem({ description: "Lateral", quantity: 1, unitPriceGross: 12000 }, 2);
    expect(line2.lineTotalGross).toBe(12000);
  });

  it("should recalculate deterministic request totals server-side", () => {
    const totals = calculateRequestTotals([
      { description: "Toldo", quantity: 2, unitPriceGross: 28000 },
      { description: "Lateral", quantity: 1, unitPriceGross: 12000 },
    ]);

    expect(totals.items).toHaveLength(2);
    expect(totals.expectedGrossTotal).toBe(68000); // 56.000 + 12.000
    expect(totals.expectedNetTotal).toBe(57142); // 47.058 + 10.084
    expect(totals.calculatedVatTotal).toBe(10858);
  });

  it("should format CLP amounts with dots as thousands separators and dollar sign", () => {
    expect(formatCLP(28000)).toBe("$28.000");
    expect(formatCLP(68000)).toBe("$68.000");
    expect(formatCLP(1250000)).toBe("$1.250.000");
    expect(formatCLP(0)).toBe("$0");
  });

  describe("SII Reconciliation Rules (Match, Rounding Accepted, Mismatch)", () => {
    it("should classify difference 0 as MATCH (canProceed: true)", () => {
      const res = calculateReconciliation(68000, 68000);
      expect(res.status).toBe("MATCH");
      expect(res.grossDifference).toBe(0);
      expect(res.canProceed).toBe(true);
    });

    it("should classify difference -1 as ROUNDING_ACCEPTED (canProceed: true)", () => {
      const res = calculateReconciliation(68000, 67999);
      expect(res.status).toBe("ROUNDING_ACCEPTED");
      expect(res.grossDifference).toBe(-1);
      expect(res.canProceed).toBe(true);
    });

    it("should classify difference +1 as ROUNDING_ACCEPTED (canProceed: true)", () => {
      const res = calculateReconciliation(68000, 68001);
      expect(res.status).toBe("ROUNDING_ACCEPTED");
      expect(res.grossDifference).toBe(1);
      expect(res.canProceed).toBe(true);
    });

    it("should classify difference -2 as ROUNDING_ACCEPTED (canProceed: true)", () => {
      const res = calculateReconciliation(68000, 67998);
      expect(res.status).toBe("ROUNDING_ACCEPTED");
      expect(res.grossDifference).toBe(-2);
      expect(res.canProceed).toBe(true);
    });

    it("should classify difference +2 as ROUNDING_ACCEPTED (canProceed: true)", () => {
      const res = calculateReconciliation(68000, 68002);
      expect(res.status).toBe("ROUNDING_ACCEPTED");
      expect(res.grossDifference).toBe(2);
      expect(res.canProceed).toBe(true);
    });

    it("should classify difference -3 as MISMATCH (canProceed: false)", () => {
      const res = calculateReconciliation(68000, 67997);
      expect(res.status).toBe("MISMATCH");
      expect(res.grossDifference).toBe(-3);
      expect(res.canProceed).toBe(false);
    });

    it("should classify difference +3 as MISMATCH (canProceed: false)", () => {
      const res = calculateReconciliation(68000, 68003);
      expect(res.status).toBe("MISMATCH");
      expect(res.grossDifference).toBe(3);
      expect(res.canProceed).toBe(false);
    });

    it("should reject non-positive or non-integer amounts for reconciliation", () => {
      expect(() => calculateReconciliation(0, 68000)).toThrow();
      expect(() => calculateReconciliation(68000, 0)).toThrow();
      expect(() => calculateReconciliation(68000, -100)).toThrow();
      expect(() => calculateReconciliation(68000.5, 68000)).toThrow();
      expect(() => calculateReconciliation(68000, 68000.5)).toThrow();
    });
  });
});
