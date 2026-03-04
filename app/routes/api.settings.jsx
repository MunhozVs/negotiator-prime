import { json } from "react-router";
import supabase from "../supabase.server";

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
        return json({ error: "Missing shop parameter" }, { status: 400 });
    }

    // 1. Get Shop UUID
    const { data: shopRecord } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shop)
        .single();

    if (!shopRecord) {
        return json({ error: "Shop not found" }, { status: 404 });
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

    return json({
        settings: settings || {},
        global_rules: globalRule || {
            min_discount_percent: 5,
            max_discount_percent: 20,
            counter_strategy: 'split_difference'
        }
    }, {
        headers: {
            "Access-Control-Allow-Origin": "*",
        }
    });
};

export const action = () => {
    return json({ error: "Method not allowed" }, { status: 405 });
};
