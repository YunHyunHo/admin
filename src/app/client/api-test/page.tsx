import { ApiChargeTestBoard } from "@/components/api-charge-test-board";
import { getIntegrationChargeDomainOptions } from "@/lib/charge-requests-repository";

export const dynamic = "force-dynamic";

export default async function ClientApiTestPage() {
  const domainOptions = await getIntegrationChargeDomainOptions();

  return <ApiChargeTestBoard domainOptions={domainOptions} />;
}
