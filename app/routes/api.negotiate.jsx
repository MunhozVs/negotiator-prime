import supabase from "../supabase.server";

export const action = async ({ request }) => {
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" }
        });
    }

    const body = await request.json();
    const { shop, productId, currentOffer, chatId } = body;

    if (!shop || !productId || currentOffer === undefined) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 1. Resolve Shop
    const { data: shopRecord } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shop)
        .single();

    if (!shopRecord) {
        return new Response(JSON.stringify({ error: "Shop not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 2. Resolve Rules (Priority: Product > Category > Global)
    // For now, we simulate category/product resolution. 
    // In a full implementation, we'd check if this product belongs to any collection with an override.
    const { data: rules } = await supabase
        .from('discount_rules')
        .select('*')
        .eq('store_id', shopRecord.id)
        .eq('is_active', true)
        .order('priority', { ascending: false });

    // Filter to find the best match
    // Product match
    let activeRule = rules.find(r => r.scope_type === 'product' && r.scope_id === productId);

    // Fallback to global if no product/category match (Category resolution would need product->collection mapping)
    if (!activeRule) {
        activeRule = rules.find(r => r.scope_type === 'global');
    }

    if (!activeRule) {
        return new Response(JSON.stringify({ error: "No negotiation rules found" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    // 3. Negotiation Logic
    const minDiscount = activeRule.min_discount_percent / 100;
    const maxDiscount = activeRule.max_discount_percent / 100;
    const strategy = activeRule.counter_strategy;

    // Example logic: currentOffer is the price offered by user.
    // We assume the caller sends the originalPrice or we fetch it? 
    // Let's assume currentOffer is a percentage of discount the user wants.
    const userRequestedDiscount = parseFloat(currentOffer) / 100;

    let response = {};

    if (userRequestedDiscount <= minDiscount) {
        // User is asking for LESS than our minimum discount -> Accept immediately!
        response = {
            status: "accepted",
            message: "That's a fair price! We accept your offer.",
            finalDiscount: userRequestedDiscount * 100
        };
    } else if (userRequestedDiscount > maxDiscount) {
        // User asking for way too much
        response = {
            status: "rejected",
            message: "I'm sorry, we can't go that low. Our best possible discount is " + (maxDiscount * 100) + "%.",
            bestOffer: maxDiscount * 100
        };
    } else {
        // We are in the negotiation range -> Apply strategy
        let counterDiscount = userRequestedDiscount;

        if (strategy === 'split_difference') {
            counterDiscount = (minDiscount + userRequestedDiscount) / 2;
        } else if (strategy === 'hold_firm') {
            counterDiscount = minDiscount;
        } else if (strategy === 'concede_once') {
            // Concede half way once, then hold
            counterDiscount = (minDiscount + userRequestedDiscount) / 1.5;
        }

        response = {
            status: "countered",
            message: "How about we meet in the middle? I can offer you a " + (counterDiscount * 100).toFixed(1) + "% discount.",
            counterOffer: (counterDiscount * 100).toFixed(1)
        };
    }

    return new Response(JSON.stringify(response), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
};
