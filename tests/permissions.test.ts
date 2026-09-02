import { describe, it, expect } from "vitest";
import { hasPermission, getRolePermissions } from "@/domain/permissions";
import { Role, Permission } from "@/domain/types";

describe("Matriz de Roles y Permisos v1.0 & Default Deny", () => {
  it("should allow WAREHOUSE_USER only warehouse and own request permissions", () => {
    expect(hasPermission("WAREHOUSE_USER", "REQUEST_CREATE")).toBe(true);
    expect(hasPermission("WAREHOUSE_USER", "REQUEST_VIEW_OWN")).toBe(true);
    expect(hasPermission("WAREHOUSE_USER", "REQUEST_EDIT_PENDING")).toBe(true);
    expect(hasPermission("WAREHOUSE_USER", "INVOICE_VIEW")).toBe(true);

    // Forbidden for WAREHOUSE_USER
    expect(hasPermission("WAREHOUSE_USER", "REQUEST_VIEW_ALL")).toBe(false);
    expect(hasPermission("WAREHOUSE_USER", "REQUEST_CLAIM")).toBe(false);
    expect(hasPermission("WAREHOUSE_USER", "USER_MANAGE")).toBe(false);
    expect(hasPermission("WAREHOUSE_USER", "INVOICE_FINALIZE")).toBe(false);
  });

  it("should allow INVOICE_EXECUTOR queue and invoicing operations but NOT admin management or pending editing", () => {
    expect(hasPermission("INVOICE_EXECUTOR", "REQUEST_VIEW_ALL")).toBe(true);
    expect(hasPermission("INVOICE_EXECUTOR", "REQUEST_CLAIM")).toBe(true);
    expect(hasPermission("INVOICE_EXECUTOR", "INVOICE_FINALIZE")).toBe(true);
    expect(hasPermission("INVOICE_EXECUTOR", "CREDIT_NOTE_REGISTER")).toBe(true);

    // Forbidden for INVOICE_EXECUTOR
    expect(hasPermission("INVOICE_EXECUTOR", "REQUEST_EDIT_PENDING")).toBe(false);
    expect(hasPermission("INVOICE_EXECUTOR", "REQUEST_CREATE")).toBe(false);
    expect(hasPermission("INVOICE_EXECUTOR", "USER_MANAGE")).toBe(false);
    expect(hasPermission("INVOICE_EXECUTOR", "WAREHOUSE_MANAGE")).toBe(false);
  });

  it("should allow MANAGEMENT supervision, statistics, and invoicing execution operations", () => {
    expect(hasPermission("MANAGEMENT", "REQUEST_VIEW_ALL")).toBe(true);
    expect(hasPermission("MANAGEMENT", "INVOICE_VIEW")).toBe(true);
    expect(hasPermission("MANAGEMENT", "STATS_VIEW")).toBe(true);
    expect(hasPermission("MANAGEMENT", "AUDIT_VIEW")).toBe(true);
    expect(hasPermission("MANAGEMENT", "REQUEST_CLAIM")).toBe(true);
    expect(hasPermission("MANAGEMENT", "INVOICE_FINALIZE")).toBe(true);

    // Forbidden for MANAGEMENT (Pending editing is for requester/warehouse user, Admin config is for ADMIN)
    expect(hasPermission("MANAGEMENT", "REQUEST_EDIT_PENDING")).toBe(false);
    expect(hasPermission("MANAGEMENT", "USER_MANAGE")).toBe(false);
    expect(hasPermission("MANAGEMENT", "WAREHOUSE_MANAGE")).toBe(false);
  });

  it("should allow ADMIN comprehensive management and operational permissions", () => {
    expect(hasPermission("ADMIN", "USER_MANAGE")).toBe(true);
    expect(hasPermission("ADMIN", "WAREHOUSE_MANAGE")).toBe(true);
    expect(hasPermission("ADMIN", "REQUEST_REASSIGN")).toBe(true);
    expect(hasPermission("ADMIN", "AUDIT_VIEW")).toBe(true);
    expect(hasPermission("ADMIN", "INVOICE_FINALIZE")).toBe(true);
  });

  it("should enforce Default Deny for unknown roles or invalid permissions", () => {
    expect(hasPermission("UNKNOWN_ROLE" as Role, "REQUEST_CREATE")).toBe(false);
    expect(hasPermission("ADMIN", "NON_EXISTENT_PERMISSION" as Permission)).toBe(false);
  });
});
