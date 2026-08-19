import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/v1/health/route";

describe("Health Check API v1", () => {
  it("should return ok status and valid health response structure", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("success", true);
    expect(json).toHaveProperty("data");
    expect(json.data.status).toBe("ok");
    expect(json.data.service).toBe("maxiofertas-facturacion");
    expect(json.data.version).toBe("1.0.0");
    expect(json.data).toHaveProperty("timestamp");
    expect(json.data).toHaveProperty("database");
  });
});
