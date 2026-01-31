import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const currency = searchParams.get("currency") || "USD";

  try {
    const token = process.env.MARKET_DATA_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Market data API token not configured" },
        { status: 500 }
      );
    }

    const stockURL = `https://api.marketdata.app/v1/stocks/quotes/${symbol}/?token=${token}`;
    const stockResponse = await fetch(stockURL);

    if (!stockResponse.ok) {
      throw new Error(`HTTP error! status: ${stockResponse.status}`);
    }

    const stockData = await stockResponse.json();

    if (currency && currency !== "USD") {
      const moneyURL = `https://api.frankfurter.app/latest?from=USD&to=${currency}`;
      const moneyResponse = await fetch(moneyURL);

      if (!moneyResponse.ok) {
        throw new Error("Failed to fetch currency data");
      }

      const moneyData = await moneyResponse.json();
      const convertedPrice = stockData.last * moneyData.rates[currency];

      return NextResponse.json({
        last: stockData.last,
        [currency]: convertedPrice,
      });
    }

    return NextResponse.json(stockData);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
