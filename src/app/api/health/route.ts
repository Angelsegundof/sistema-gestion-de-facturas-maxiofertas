import { GET as healthCheckV1Get } from "../v1/health/route";

export const dynamic = "force-dynamic";

export async function GET() {
  return healthCheckV1Get();
}
