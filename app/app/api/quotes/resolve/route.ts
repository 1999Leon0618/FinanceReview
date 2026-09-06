import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { resolveAccountQuotes, resolveFx } from "@/lib/quotes";
import { quoteResolveSchema } from "@/lib/validation";
import type { FxRateInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const payload = quoteResolveSchema.parse(await request.json());
    const resolved = await resolveAccountQuotes(payload.accounts);
    const warnings = [...resolved.warnings];
    const fxRates = new Map<string, FxRateInput>();
    for (const account of resolved.accounts) {
      for (const balance of account.cashBalances)
        if (balance.fxRate) fxRates.set(balance.currency, balance.fxRate);
      for (const position of account.positions)
        if (position.fxRate)
          fxRates.set(position.quoteCurrency, position.fxRate);
    }
    const missingCurrencies = [
      ...new Set(
        payload.loans
          .map((loan) => loan.currency)
          .filter((currency) => currency !== "TWD" && !fxRates.has(currency)),
      ),
    ];
    await Promise.all(
      missingCurrencies.map(async (currency) => {
        try {
          fxRates.set(currency, await resolveFx(currency));
        } catch {
          warnings.push(`${currency}/TWD 無法取得匯率`);
        }
      }),
    );
    const loans = payload.loans.map((loan) =>
      loan.currency === "TWD"
        ? loan
        : { ...loan, fxRate: fxRates.get(loan.currency) ?? loan.fxRate },
    );
    return NextResponse.json({ ...resolved, loans, warnings });
  } catch (error) {
    return apiError(error, 502);
  }
}
