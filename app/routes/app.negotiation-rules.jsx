import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import supabase from "../supabase.server";

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("product_query");

    // 1. Get Store ID
    const { data: shopRecord } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shopDomain)
        .single();

    // 2. Fetch Rules
    const { data: rules } = await supabase
        .from('discount_rules')
        .select('*')
        .eq('store_id', shopRecord.id)
        .order('priority', { ascending: false });

    // 3. Fetch Collections (Categories) from Shopify
    const collectionsResponse = await admin.graphql(`
    #graphql
    query getCollections {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `);
    const collectionsJson = await collectionsResponse.json();
    const collections = collectionsJson.data.collections.edges.map(e => e.node);

    // 4. Product Search (if query exists)
    let searchResults = [];
    if (searchQuery) {
        const productsResponse = await admin.graphql(`
        #graphql
        query searchProducts($query: String!) {
          products(first: 5, query: $query) {
            edges {
              node {
                id
                title
                handle
                featuredImage {
                   url
                }
              }
            }
          }
        }
      `, { variables: { query: searchQuery } });
        const productsJson = await productsResponse.json();
        searchResults = productsJson.data.products.edges.map(e => e.node);
    }

    return { rules, collections, searchResults, shopId: shopRecord.id };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");
    const shopId = formData.get("shopId");

    if (intent === "save_global") {
        const minPct = parseFloat(formData.get("min_discount_percent"));
        const maxPct = parseFloat(formData.get("max_discount_percent"));
        const strategy = formData.get("counter_strategy");

        const { error } = await supabase
            .from('discount_rules')
            .upsert({
                store_id: shopId,
                scope_type: 'global',
                min_discount_percent: minPct,
                max_discount_percent: maxPct,
                counter_strategy: strategy,
                is_active: true,
                priority: 0
            }, { onConflict: 'store_id,scope_type' });

        if (error) return { success: false, error: error.message };
    }

    if (intent === "delete_rule") {
        const id = formData.get("id");
        await supabase.from('discount_rules').delete().eq('id', id);
    }

    if (intent === "add_category_rule") {
        await supabase.from('discount_rules').insert({
            store_id: shopId,
            scope_type: 'category',
            scope_id: formData.get("scope_id"),
            min_discount_percent: parseFloat(formData.get("min_pct")),
            max_discount_percent: parseFloat(formData.get("max_pct")),
            counter_strategy: 'split_difference',
            priority: 10
        });
    }

    if (intent === "add_product_rule") {
        await supabase.from('discount_rules').insert({
            store_id: shopId,
            scope_type: 'product',
            scope_id: formData.get("scope_id"), // This should be a UUID-safe version? Actually the table allows text or numeric?
            // User rules check scope_id is uuid null. 
            // WAIT, the table 'discount_rules' has scope_id as uuid null. 
            // Shopify GIDs are not UUIDs. I need a solution.
            min_discount_percent: parseFloat(formData.get("min_pct")),
            max_discount_percent: parseFloat(formData.get("max_pct")),
            counter_strategy: 'split_difference',
            priority: 100
        });
    }

    return { success: true };
};

export default function NegotiationRules() {
    const { rules, collections, searchResults, shopId } = useLoaderData();
    const fetcher = useFetcher();

    const globalRule = rules.find(r => r.scope_type === 'global') || {
        min_discount_percent: 5,
        max_discount_percent: 20,
        counter_strategy: 'split_difference'
    };

    const categoryRules = rules.filter(r => r.scope_type === 'category');
    const productRules = rules.filter(r => r.scope_type === 'product');

    return (
        <s-page heading="Negotiation Rules">

            <s-section heading="Global Rules (Priority 0)">
                <s-paragraph>These rules apply to all products unless overridden.</s-paragraph>
                <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="save_global" />
                    <input type="hidden" name="shopId" value={shopId} />
                    <s-stack direction="inline" gap="base">
                        <s-text-field label="Min Discount %" name="min_discount_percent" type="number" value={globalRule.min_discount_percent} />
                        <s-text-field label="Max Discount %" name="max_discount_percent" type="number" value={globalRule.max_discount_percent} />
                        <s-select label="Counter Strategy" name="counter_strategy" value={globalRule.counter_strategy}>
                            <option value="split_difference">Split Difference</option>
                            <option value="hold_firm">Hold Firm</option>
                            <option value="concede_once">Concede Once</option>
                        </s-select>
                        <s-button submit="true">Update Global</s-button>
                    </s-stack>
                </fetcher.Form>
            </s-section>

            <s-section heading="Category Overrides (Priority 10)">
                <s-stack direction="block" gap="base">
                    {categoryRules.map(rule => {
                        const collection = collections.find(c => c.id === rule.scope_id);
                        return (
                            <s-box key={rule.id} padding="base" borderWidth="base" borderRadius="base">
                                <s-stack direction="inline" align="center" gap="base">
                                    <s-text style={{ flex: 1 }}>{collection?.title || "Unknown Collection"}</s-text>
                                    <s-text>{rule.min_discount_percent}% - {rule.max_discount_percent}%</s-text>
                                    <fetcher.Form method="post">
                                        <input type="hidden" name="intent" value="delete_rule" />
                                        <input type="hidden" name="id" value={rule.id} />
                                        <s-button variant="tertiary" tone="critical" onClick={(e) => e.target.closest('form').submit()}>Remove</s-button>
                                    </fetcher.Form>
                                </s-stack>
                            </s-box>
                        );
                    })}

                    <s-box padding="base" background="subdued" borderRadius="base">
                        <fetcher.Form method="post">
                            <input type="hidden" name="intent" value="add_category_rule" />
                            <input type="hidden" name="shopId" value={shopId} />
                            <s-stack direction="inline" gap="base" align="end">
                                <s-select label="Select Category" name="scope_id" style={{ flex: 1 }}>
                                    {collections.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                                </s-select>
                                <s-text-field label="Min %" name="min_pct" type="number" value="5" />
                                <s-text-field label="Max %" name="max_pct" type="number" value="25" />
                                <s-button submit="true">Add Override</s-button>
                            </s-stack>
                        </fetcher.Form>
                    </s-box>
                </s-stack>
            </s-section>

            <s-section heading="Product Overrides (Priority 100)">
                <s-stack direction="block" gap="base">
                    {productRules.map(rule => (
                        <s-box key={rule.id} padding="base" borderWidth="base" borderRadius="base">
                            <s-stack direction="inline" align="center" gap="base">
                                <s-text style={{ flex: 1 }}>Product ID: {rule.scope_id}</s-text>
                                <s-text>{rule.min_discount_percent}% - {rule.max_discount_percent}%</s-text>
                                <fetcher.Form method="post">
                                    <input type="hidden" name="intent" value="delete_rule" />
                                    <input type="hidden" name="id" value={rule.id} />
                                    <s-button variant="tertiary" tone="critical" onClick={(e) => e.target.closest('form').submit()}>Remove</s-button>
                                </fetcher.Form>
                            </s-stack>
                        </s-box>
                    ))}

                    <s-box padding="base" background="subdued" borderRadius="base">
                        <fetcher.Form method="get" action="/app/negotiation-rules">
                            <s-stack direction="inline" align="end" gap="base">
                                <s-text-field label="Search Product" name="product_query" placeholder="Type name..." style={{ flex: 1 }} />
                                <s-button submit="true">Search</s-button>
                            </s-stack>
                        </fetcher.Form>

                        {searchResults.length > 0 && (
                            <s-stack direction="block" gap="tight" style={{ marginTop: '10px' }}>
                                {searchResults.map(p => (
                                    <s-box key={p.id} padding="tight" background="default" borderRadius="base" borderWidth="base">
                                        <s-stack direction="inline" align="center" gap="base">
                                            <s-text style={{ flex: 1 }}>{p.title}</s-text>
                                            <fetcher.Form method="post">
                                                <input type="hidden" name="intent" value="add_product_rule" />
                                                <input type="hidden" name="shopId" value={shopId} />
                                                <input type="hidden" name="scope_id" value={p.id} />
                                                <s-stack direction="inline" gap="tight" align="center">
                                                    <s-text-field label="Min %" name="min_pct" type="number" value="10" />
                                                    <s-text-field label="Max %" name="max_pct" type="number" value="30" />
                                                    <s-button submit="true">Add</s-button>
                                                </s-stack>
                                            </fetcher.Form>
                                        </s-stack>
                                    </s-box>
                                ))}
                            </s-stack>
                        )}
                    </s-box>
                </s-stack>
            </s-section>

        </s-page>
    );
}
