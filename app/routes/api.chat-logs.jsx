import supabase from "../supabase.server";
import {
  getShopifyStoreId,
  jsonResponse,
  requireAppProxyShop,
} from "../shop-context.server";

const ALLOWED_SENDERS = new Set(["user", "bot", "system"]);
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

  const { admin, shop } = await requireAppProxyShop(request, { requireSession: true });

  try {
    const body = await request.json();
    const chatId = optionalText(body.chatId, 128);
    const sender = optionalText(body.sender, 16);
    const content = optionalText(body.content, 5000);

    if (!chatId || !sender || !content || !ALLOWED_SENDERS.has(sender)) {
      return jsonResponse({ error: "Invalid interaction payload" }, { status: 400 });
    }

    const storeId = await getShopifyStoreId(admin);
    const round = Number(body.metadata?.round);
    const offerValue = Number(body.metadata?.offer_value);
    const metadata = body.metadata && typeof body.metadata === "object"
      ? body.metadata
      : {};

    if (JSON.stringify(metadata).length > 10_000) {
      return jsonResponse({ error: "Interaction metadata is too large" }, { status: 413 });
    }

    const { error } = await supabase.from("chat_interactions").insert({
      shop_id: shop.id,
      store_id: storeId,
      chat_id: chatId,
      visitor_id: optionalText(body.visitor_id, 128),
      product_id: optionalText(body.productId, 128),
      product_title: optionalText(body.product_title, 500),
      variant_id: optionalText(body.variant_id, 128),
      sender,
      content,
      current_round: Number.isFinite(round) ? round : null,
      current_price: Number.isFinite(offerValue) ? offerValue : null,
      metadata,
    });

    if (error) {
      console.error("Unable to log chat interaction", { code: error.code });
      return jsonResponse({ error: "Unable to log interaction" }, { status: 500 });
    }

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return jsonResponse({ error: "Invalid JSON payload" }, { status: 400 });
    }

    console.error("Unexpected chat logging error", { message: error.message });
    return jsonResponse({ error: "Unable to log interaction" }, { status: 500 });
  }
};

export const loader = async () =>
  jsonResponse({ error: "Not found" }, { status: 404 });
