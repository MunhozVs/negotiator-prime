import supabase from "../supabase.server";
import { jsonResponse, requireAppProxyShop } from "../shop-context.server";
import { negotiateDiscount } from "../services/negotiation.js";

export const action = async ({ request }) => {
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, { status: 405 });
    }

    const { shop } = await requireAppProxyShop(request, { requireSession: true });
    let body;

    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { productId, currentOffer } = body;
    const requestedDiscount = Number(currentOffer);

    if (!productId || !Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > 100) {
        return jsonResponse({ error: "Invalid negotiation payload" }, { status: 400 });
    }

    const { data: rules, error } = await supabase
        .from('discount_rules')
        .select('*')
        .eq('store_id', shop.id)
        .eq('is_active', true)
        .order('priority', { ascending: false });

    if (error) {
        console.error("Unable to load negotiation rules", { code: error.code });
        return jsonResponse({ error: "Unable to load negotiation rules" }, { status: 500 });
    }

    let activeRule = rules?.find(r => r.scope_type === 'product' && r.scope_id === String(productId));

    if (!activeRule) {
        activeRule = rules?.find(r => r.scope_type === 'global');
    }

    if (!activeRule) {
        return jsonResponse({ error: "No negotiation rules found" }, { status: 404 });
    }

    return jsonResponse(negotiateDiscount(activeRule, requestedDiscount));
};

export const loader = async () =>
    jsonResponse({ error: "Not found" }, { status: 404 });
