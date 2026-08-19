export function normalizeRut(rut: string): string {
  if (!rut || typeof rut !== "string") return "";
  return rut.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function validateRut(rut: string): boolean {
  if (!rut || typeof rut !== "string") return false;
  const clean = normalizeRut(rut);
  if (clean.length < 8 || clean.length > 10) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expectedDvNum = 11 - (sum % 11);
  let expectedDv = expectedDvNum.toString();
  if (expectedDvNum === 11) expectedDv = "0";
  if (expectedDvNum === 10) expectedDv = "K";

  return dv === expectedDv;
}

export function formatRut(rut: string): string {
  const clean = normalizeRut(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formattedBody}-${dv}`;
}
