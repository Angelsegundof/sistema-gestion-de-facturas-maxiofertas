import { describe, it, expect } from "vitest";
import { validateRut, normalizeRut, formatRut } from "@/lib/validation/rut";

describe("Chilean RUT Validation and Normalization", () => {
  it("should accurately validate correct Chilean RUTs", () => {
    // Known valid Chilean corporate & individual RUTs with modulo 11 algorithm
    expect(validateRut("76.432.109-K")).toBe(true);
    expect(validateRut("76432109k")).toBe(true);
    expect(validateRut("12.345.678-5")).toBe(true);
    expect(validateRut("5.555.555-9")).toBe(true);
    expect(validateRut("19.876.543-0")).toBe(true);
  });

  it("should reject invalid, corrupted, or malformed RUTs", () => {
    expect(validateRut("11.111.111-2")).toBe(false);
    expect(validateRut("12345678-0")).toBe(false);
    expect(validateRut("5.555.555-5")).toBe(false);
    expect(validateRut("")).toBe(false);
    expect(validateRut("not-a-rut")).toBe(false);
    expect(validateRut("123")).toBe(false);
  });

  it("should normalize RUTs to canonical uppercase format without formatting chars", () => {
    expect(normalizeRut("76.432.109-k")).toBe("76432109K");
    expect(normalizeRut(" 5.555.555-9 ")).toBe("55555559");
    expect(normalizeRut("12345678-5")).toBe("123456785");
  });

  it("should normalize interchangeable RUT formats (unformatted, with hyphen, with dots) to same canonical and display", () => {
    const rawPlain = "761234560";
    const rawDotsHyphen = "76.123.456-0";
    const rawHyphenOnly = "76123456-0";

    expect(validateRut(rawPlain)).toBe(true);
    expect(validateRut(rawDotsHyphen)).toBe(true);
    expect(validateRut(rawHyphenOnly)).toBe(true);

    const canonical = "761234560";
    expect(normalizeRut(rawPlain)).toBe(canonical);
    expect(normalizeRut(rawDotsHyphen)).toBe(canonical);
    expect(normalizeRut(rawHyphenOnly)).toBe(canonical);

    const display = "76.123.456-0";
    expect(formatRut(rawPlain)).toBe(display);
    expect(formatRut(rawDotsHyphen)).toBe(display);
    expect(formatRut(rawHyphenOnly)).toBe(display);
  });

  it("should format canonical RUTs to standard display format with dots and hyphen", () => {
    expect(formatRut("76432109K")).toBe("76.432.109-K");
    expect(formatRut("55555559")).toBe("5.555.555-9");
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });
});
