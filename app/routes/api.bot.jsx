import {
  getShopifyStoreId,
  jsonResponse,
  requireAppProxyShop,
} from "../shop-context.server";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_REQUEST_BYTES = 50_000;

function optionalText(value, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).slice(0, maxLength);
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: "Request too large" }, { status: 413 });
  }

  const { admin, shopDomain } = await requireAppProxyShop(request, {
    requireSession: true,
  });
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookUrl || !webhookSecret) {
    console.error("Negotiation webhook credentials are not configured");
    return jsonResponse({ error: "Negotiation service unavailable" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const chatId = optionalText(body.chatId, 128);

    if (!message || message.length > MAX_MESSAGE_LENGTH || !chatId) {
      return jsonResponse({ error: "Invalid negotiation payload" }, { status: 400 });
    }

    const storeId = await getShopifyStoreId(admin);
    const currentRound = Number(body.currentRound);
    const currentPrice = Number(body.currentPrice);
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${webhookSecret}`,
    };

    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        chatId,
        visitor_id: optionalText(body.visitor_id, 128),
        shop: shopDomain,
        store_id: storeId,
        productId: optionalText(body.productId, 128),
        variantId: optionalText(body.variantId, 128),
        productPrice: optionalText(body.productPrice, 64),
        emailCaptureRound: optionalText(body.emailCaptureRound, 32),
        termsLink: optionalText(body.termsLink, 500),
        currentRound: Number.isFinite(currentRound) ? currentRound : 0,
        currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      console.error("Negotiation webhook failed", { status: upstream.status });
      return jsonResponse({ error: "Negotiation service unavailable" }, { status: 502 });
    }

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid JSON payload" }, { status: 400 });
    }

    console.error("Negotiation proxy failed", { message: error.message });
    return jsonResponse({ error: "Negotiation service unavailable" }, { status: 502 });
  }
};

export const loader = async () =>
  jsonResponse({ error: "Not found" }, { status: 404 });
