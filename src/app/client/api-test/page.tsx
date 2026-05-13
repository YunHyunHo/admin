import { ApiChargeTestBoard } from "@/components/api-charge-test-board";
import {
  getIntegrationChargeDistributorOptions,
  getIntegrationChargeDomainOptions,
} from "@/lib/charge-requests-repository";

export const dynamic = "force-dynamic";

export default async function ClientApiTestPage() {
  const [domainOptions, distributorOptions] = await Promise.all([
    getIntegrationChargeDomainOptions(),
    getIntegrationChargeDistributorOptions(),
  ]);

  return (
    <ApiChargeTestBoard
      distributorOptions={distributorOptions}
      domainOptions={domainOptions}
    />
  );
}
