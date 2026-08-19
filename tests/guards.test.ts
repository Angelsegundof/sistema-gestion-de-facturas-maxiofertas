import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requireAuth,
  requireRole,
  requirePermission,
  UnauthorizedError,
  ForbiddenError,
} from "@/lib/auth/guards";
import * as sessionModule from "@/lib/auth/session";

describe("Server-Side Authorization Guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw UnauthorizedError if user is not authenticated or has no active session", async () => {
    vi.spyOn(sessionModule, "getServerSession").mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
  });

  it("should throw UnauthorizedError if user account is inactive (active = false)", async () => {
    vi.spyOn(sessionModule, "getServerSession").mockResolvedValue({
      session: { id: "s-1", userId: "u-1", expiresAt: new Date() },
      user: {
        id: "u-1",
        email: "inactive@test.cl",
        name: "Inactive User",
        role: "WAREHOUSE_USER",
        warehouseId: null,
        active: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    await expect(requireAuth()).rejects.toThrow(UnauthorizedError);
  });

  it("should return user if user is authenticated and active", async () => {
    const mockUser = {
      id: "u-1",
      email: "active@test.cl",
      name: "Active User",
      role: "WAREHOUSE_USER" as const,
      warehouseId: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.spyOn(sessionModule, "getServerSession").mockResolvedValue({
      session: { id: "s-1", userId: "u-1", expiresAt: new Date() },
      user: mockUser,
    });

    const user = await requireAuth();
    expect(user.id).toBe("u-1");
    expect(user.role).toBe("WAREHOUSE_USER");
  });

  it("should enforce role validation with requireRole", async () => {
    vi.spyOn(sessionModule, "getServerSession").mockResolvedValue({
      session: { id: "s-1", userId: "u-1", expiresAt: new Date() },
      user: {
        id: "u-1",
        email: "warehouse@test.cl",
        name: "Warehouse User",
        role: "WAREHOUSE_USER",
        warehouseId: null,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    // Allowed role
    const user = await requireRole(["WAREHOUSE_USER", "ADMIN"]);
    expect(user.role).toBe("WAREHOUSE_USER");

    // Disallowed role -> ForbiddenError
    await expect(requireRole(["ADMIN", "INVOICE_EXECUTOR"])).rejects.toThrow(ForbiddenError);
  });

  it("should enforce explicit permission validation with requirePermission", async () => {
    vi.spyOn(sessionModule, "getServerSession").mockResolvedValue({
      session: { id: "s-1", userId: "u-1", expiresAt: new Date() },
      user: {
        id: "u-1",
        email: "executor@test.cl",
        name: "Executor User",
        role: "INVOICE_EXECUTOR",
        warehouseId: null,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    // Executor has INVOICE_FINALIZE
    const user = await requirePermission("INVOICE_FINALIZE");
    expect(user.role).toBe("INVOICE_EXECUTOR");

    // Executor does NOT have USER_MANAGE -> ForbiddenError
    await expect(requirePermission("USER_MANAGE")).rejects.toThrow(ForbiddenError);
  });
});
