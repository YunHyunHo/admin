import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAPLE_PREVIEW_BRANCH = "codex/maple-sse-no-polling";

type TransactionResponse = {
  code?: number;
  result?: {
    request_id?: string;
    external_id?: string;
    duplicate?: boolean;
    price?: number;
    coin_amount?: number;
  };
};

async function sendPreviewTransaction(
  url: URL,
  apiKey: string,
  bypassSecret: string,
  externalId: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-vercel-protection-bypass": bypassSecret,
    },
    body: JSON.stringify({
      externalId,
      id: "maple-preview-api-check",
      coinCount: 1,
      bankHolderName: "Maple Preview",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json()) as TransactionResponse;

  return {
    status: response.status,
    code: payload.code,
    duplicate: payload.result?.duplicate,
    requestId: payload.result?.request_id,
    externalId: payload.result?.external_id,
    price: payload.result?.price,
    coinAmount: payload.result?.coin_amount,
  };
}

/**
 * Temporary, Vercel-authenticated Preview test harness.
 * It keeps both credentials server-side and exercises the public API contract.
 */
export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== MAPLE_PREVIEW_BRANCH
  ) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const apiKey = process.env.MAPLE_PREVIEW_CHARGE_API_KEY?.trim() ?? "";
  const bypassSecret =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

  if (!apiKey || !bypassSecret) {
    return NextResponse.json(
      { ok: false, reason: "preview-test-configuration-missing" },
      { status: 503 },
    );
  }

  const transactionUrl = new URL(
    "/api/integration/make-transaction",
    request.url,
  );
  const externalId = randomUUID();
  const first = await sendPreviewTransaction(
    transactionUrl,
    apiKey,
    bypassSecret,
    externalId,
  );
  const second = await sendPreviewTransaction(
    transactionUrl,
    apiKey,
    bypassSecret,
    externalId,
  );

  return NextResponse.json(
    { ok: first.status === 201 && second.status === 200, first, second },
    { headers: { "cache-control": "no-store" } },
  );
}
