import { authenticate } from "./shopify.server";
import supabase from "./supabase.server";

export function jsonResponse(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(data), { ...init, headers });
}

function httpError(status, message) {
  return jsonResponse({ error: message }, { status });
}

async function findShop(shopDomain) {
  const { data, error } = await supabase
    .from("shops")
    .select("id, shop_domain")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (error) {
    console.error("Unable to resolve shop", { code: error.code });
    throw httpError(500, "Unable to resolve shop");
  }

  return data;
}

export async function requireAdminShop(request, { create = true } = {}) {
  const { session, admin } = await authenticate.admin(request);
  let shop = await findShop(session.shop);

  if (!shop && create) {
    const { data, error } = await supabase
      .from("shops")
      .insert({ shop_domain: session.shop })
      .select("id, shop_domain")
      .single();

    if (error) {
      console.error("Unable to create shop", { code: error.code });
      throw httpError(500, "Unable to initialize shop");
    }

    shop = data;
  }

  if (!shop) {
    throw httpError(404, "Shop not found");
  }

  return { admin, session, shop };
}

export async function requireAppProxyShop(request, { requireSession = false } = {}) {
  const context = await authenticate.public.appProxy(request);
  const signedShop = new URL(request.url).searchParams.get("shop")?.toLowerCase();

  if (!signedShop) {
    throw httpError(400, "Missing signed shop parameter");
  }

  if (context.session && context.session.shop !== signedShop) {
    throw httpError(403, "Shop mismatch");
  }

  if (requireSession && (!context.session || !context.admin)) {
    throw httpError(401, "Shop session unavailable");
  }

  const shop = await findShop(signedShop);
  if (!shop) {
    throw httpError(404, "Shop not found");
  }

  return { ...context, shop, shopDomain: signedShop };
}

export async function getShopifyStoreId(admin) {
  if (!admin) {
    throw httpError(401, "Shop session unavailable");
  }

  const response = await admin.graphql(`
    #graphql
    query NegotiatorPrimeShopId {
      shop {
        id
      }
    }
  `);
  const payload = await response.json();
  const gid = payload.data?.shop?.id;

  if (!response.ok || !gid) {
    console.error("Unable to fetch Shopify store id", {
      errors: payload.errors?.map((error) => error.message),
    });
    throw httpError(502, "Unable to resolve Shopify store");
  }

  return gid.split("/").pop();
}
