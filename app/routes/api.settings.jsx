import supabase from "../supabase.server";

export const loader = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
        return new Response(JSON.stringify({ error: "Missing shop parameter" }), {
            status: 400,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    // 1. Get Shop UUID
    const { data: shopRecord } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shop)
        .single();

    if (!shopRecord) {
        return new Response(JSON.stringify({ error: "Shop not found" }), {
            status: 404,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    // 2. Fetch Settings
    const { data: settings } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('store_id', shopRecord.id)
        .single();

    // 3. Fetch Global Rule
    const { data: globalRule } = await supabase
        .from('discount_rules')
        .select('*')
        .eq('store_id', shopRecord.id)
        .eq('scope_type', 'global')
        .single();

    return new Response(JSON.stringify({
        settings: settings || {},
        global_rules: globalRule || {
            min_discount_percent: 5,
            max_discount_percent: 20,
            counter_strategy: 'split_difference'
        }
    }), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        }
    });
};

export const action = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        });
    }
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
};
