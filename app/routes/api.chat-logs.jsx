import supabase from "../supabase.server";

export const action = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        });
    }

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }

    try {
        const body = await request.json();
        const { chatId, visitor_id, shop, sender, content, productId, product_title, variant_id, metadata, store_id } = body;

        if (!chatId || !shop || !sender || !content) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        // 1. Resolve Shop UUID
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

        // 2. Insert interaction
        const { error: insertError } = await supabase
            .from('chat_interactions')
            .insert([{
                shop_id: shopRecord.id, // Supabase UUID
                store_id: store_id ? store_id.toString() : null, // Shopify numeric ID
                chat_id: chatId,
                visitor_id: visitor_id, // Storing as a column
                product_id: productId?.toString(),
                product_title: product_title,
                variant_id: variant_id?.toString(),
                sender,
                content,
                current_round: metadata?.round ? Number(metadata.round) : null,
                current_price: metadata?.offer_value ? Number(metadata.offer_value) : null,
                metadata: metadata || {}
            }]);

        if (insertError) {
            console.error("Supabase Insert Error into chat_interactions:", {
                message: insertError.message,
                details: insertError.details,
                hint: insertError.hint,
                code: insertError.code,
                data: {
                    store_id: shopRecord.id,
                    chat_id: chatId,
                    sender,
                    content
                }
            });
            return new Response(JSON.stringify({ error: insertError.message }), {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });

    } catch (e) {
        console.error("API Error:", e);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            }
        });
    }
};

// Handle CORS for preflight requests
export const loader = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }
    return new Response("Not found", { status: 404 });
};
