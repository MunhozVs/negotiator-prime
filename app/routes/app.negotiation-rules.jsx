import { useState, useCallback, useEffect, useRef, memo } from "react";
import { useLoaderData, useFetcher } from "react-router";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    TextField,
    InlineStack,
    Button,
    Select,
    Text,
    Box,
    Divider,
    ResourceList,
    ResourceItem,
    Toast,
    Frame,
    Icon,
    Modal,
    Thumbnail as PolarisThumbnail,
} from "@shopify/polaris";
import { DeleteIcon, SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import supabase from "../supabase.server";

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("product_query");

    // 1. Get Store ID
    let { data: shopRecord, error: shopError } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shopDomain)
        .single();

    if (!shopRecord) {
        return { rules: [], collections: [], searchResults: [], shopId: null };
    }

    // 2. Fetch Rules
    const { data: rulesData, error: rulesError } = await supabase
        .from('discount_rules')
        .select('*')
        .eq('store_id', shopRecord.id)
        .order('priority', { ascending: false });

    // 3. Fetch Collections
    const collectionsResponse = await admin.graphql(`
    #graphql
    query getCollections {
      collections(first: 50) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  `);
    const collectionsJson = await collectionsResponse.json();
    const collections = collectionsJson.data.collections.edges.map(e => e.node);

    const rules = rulesData || [];

    // 4. Fetch Product Details for Product Rules
    const productRuleIds = rules
        .filter(r => r.scope_type === 'product' && r.scope_id)
        .map(r => r.scope_id);

    let productDetails = {};
    if (productRuleIds.length > 0) {
        const productInfoResponse = await admin.graphql(`
          #graphql
          query getProductsInfo($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        `, { variables: { ids: productRuleIds } });

        const productInfoJson = await productInfoResponse.json();
        if (productInfoJson.data?.nodes) {
            productInfoJson.data.nodes.forEach(node => {
                if (node) {
                    productDetails[node.id] = {
                        title: node.title,
                        image: node.featuredImage?.url
                    };
                }
            });
        }
    }

    // 5. Fetch Shopify Store ID
    const shopResponse = await admin.graphql(`
        #graphql
        query getShop {
          shop {
            id
          }
        }
    `);
    const shopJson = await shopResponse.json();
    const shopifyGid = shopJson.data.shop.id;
    const shopifyStoreId = shopifyGid.split('/').pop();

    // 6. Fetch Shop Settings for Lead Capture
    const { data: shopSettings } = await supabase
        .from('shop_settings')
        .select('email_capture_round, terms_and_conditions_link')
        .eq('store_id', shopRecord.id)
        .single();

    return {
        rules,
        collections,
        productDetails,
        shopId: shopRecord.id,
        shopifyStoreId,
        shopSettings: shopSettings || {}
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");
    const shopId = formData.get("shopId");
    const shopifyStoreId = formData.get("shopifyStoreId");

    console.log(`Action Intent: ${intent} for shopId: ${shopId}, shopifyStoreId: ${shopifyStoreId}`);

    if (intent === "save_global") {
        const id = formData.get("id");
        const minPct = parseFloat(formData.get("min_discount_percent"));
        const maxPct = parseFloat(formData.get("max_discount_percent"));
        const strategy = formData.get("counter_strategy");

        const upsertData = {
            store_id: shopId,
            shopify_store_id: shopifyStoreId,
            scope_type: 'global',
            scope_id: null,
            min_discount_percent: minPct,
            max_discount_percent: maxPct,
            counter_strategy: strategy,
            is_active: true,
            priority: 0
        };

        if (id && id !== "null") upsertData.id = id;

        const { error } = await supabase
            .from('discount_rules')
            .upsert(upsertData, { onConflict: 'id' });

        if (error) {
            console.error("Supabase Error (save_global):", error);
            return { success: false, error: error.message };
        }
    }

    if (intent === "save_capture_settings") {
        const emailCaptureRound = formData.get("email_capture_round");
        const termsLink = formData.get("terms_and_conditions_link");

        // Try to update existing record first
        const { error: updateError, data: updatedData } = await supabase
            .from('shop_settings')
            .update({
                email_capture_round: emailCaptureRound,
                terms_and_conditions_link: termsLink
            })
            .eq('store_id', shopId)
            .select();

        // If no record exists, insert a new one
        if (!updatedData || updatedData.length === 0) {
            const { error: insertError } = await supabase
                .from('shop_settings')
                .insert([{
                    store_id: shopId,
                    email_capture_round: emailCaptureRound,
                    terms_and_conditions_link: termsLink
                }]);

            if (insertError) {
                console.error("Supabase Error (insert capture settings):", insertError);
                return { success: false, error: insertError.message };
            }
        } else if (updateError) {
            console.error("Supabase Error (update capture settings):", updateError);
            return { success: false, error: updateError.message };
        }
    }

    if (intent === "delete_rule") {
        const id = formData.get("id");
        const { error } = await supabase.from('discount_rules').delete().eq('id', id);
        if (error) {
            console.error("Supabase Error (delete_rule):", error);
            return { success: false, error: error.message };
        }
    }

    if (intent === "add_category_rule") {
        const id = formData.get("id");
        const upsertData = {
            store_id: shopId,
            shopify_store_id: shopifyStoreId,
            scope_type: 'category',
            scope_id: formData.get("scope_id"),
            min_discount_percent: parseFloat(formData.get("min_pct")),
            max_discount_percent: parseFloat(formData.get("max_pct")),
            counter_strategy: 'split_difference',
            priority: 10
        };

        if (id && id !== "null") upsertData.id = id;

        const { error } = await supabase.from('discount_rules').upsert(upsertData, { onConflict: 'id' });
        if (error) {
            console.error("Supabase Error (add_category_rule):", error);
            return { success: false, error: error.message };
        }
    }

    if (intent === "add_product_rule") {
        const id = formData.get("id");
        const upsertData = {
            store_id: shopId,
            shopify_store_id: shopifyStoreId,
            scope_type: 'product',
            scope_id: formData.get("scope_id"),
            min_discount_percent: parseFloat(formData.get("min_pct")),
            max_discount_percent: parseFloat(formData.get("max_pct")),
            counter_strategy: 'split_difference',
            priority: 100
        };

        if (id && id !== "null") upsertData.id = id;

        const { error } = await supabase.from('discount_rules').upsert(upsertData, { onConflict: 'id' });
        if (error) {
            console.error("Supabase Error (add_product_rule):", error);
            return { success: false, error: error.message };
        }
    }

    return { success: true };
};

// ProductRuleRow is no longer used for search results
// Existing rules are listed directly in the parent component for simplicity


export default function NegotiationRules() {
    const { rules, collections, productDetails, shopId, shopifyStoreId, shopSettings } = useLoaderData();
    const fetcher = useFetcher();
    const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("Changes saved");
    const [toastError, setToastError] = useState(false);

    // Resource Picker & Modal States
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [modalMin, setModalMin] = useState("10");
    const [modalMax, setModalMax] = useState("30");
    const [modalError, setModalError] = useState(null);

    const initialGlobal = rules.find(r => r.scope_type === 'global') || {
        min_discount_percent: 5,
        max_discount_percent: 20,
        counter_strategy: 'split_difference'
    };

    // Controlled States for Global Rule
    const [minDiscount, setMinDiscount] = useState(initialGlobal.min_discount_percent.toString());
    const [maxDiscount, setMaxDiscount] = useState(initialGlobal.max_discount_percent.toString());
    const [strategy, setStrategy] = useState(initialGlobal.counter_strategy);

    // Controlled States for New Category Rule
    const [newCategoryScope, setNewCategoryScope] = useState("");
    const [newCategoryMin, setNewCategoryMin] = useState("5");
    const [newCategoryMax, setNewCategoryMax] = useState("25");

    const categoryRules = rules.filter(r => r.scope_type === 'category');
    const productRules = rules.filter(r => r.scope_type === 'product');

    const strategyOptions = [
        { label: 'Split Difference', value: 'split_difference' },
        { label: 'Hold Firm', value: 'hold_firm' },
        { label: 'Concede Once', value: 'concede_once' },
    ];

    const captureRoundOptions = [
        { label: 'Before starting (Round 0)', value: 'pre_start' },
        { label: 'After Round 1', value: 'round_1' },
        { label: 'After Round 2', value: 'round_2' },
        { label: 'After Round 3', value: 'round_3' },
        { label: 'After Round 4', value: 'round_4' },
        { label: 'After finishing (Win/Loss)', value: 'post_end' },
        { label: 'Never ask', value: 'never' },
    ];

    const [emailCaptureRound, setEmailCaptureRound] = useState(shopSettings?.email_capture_round || "round_1");
    const [termsLink, setTermsLink] = useState(shopSettings?.terms_and_conditions_link || "");

    const collectionOptions = [
        { label: 'Select a category...', value: '' },
        ...collections.map(c => ({ label: c.title, value: c.id }))
    ];

    const openResourcePicker = async () => {
        const selection = await window.shopify.resourcePicker({
            type: "product",
            multiple: false,
        });

        if (selection && selection.length > 0) {
            const product = selection[0];
            setSelectedProduct(product);

            // Look for existing rule
            const existing = productRules.find(r => r.scope_id === product.id);
            if (existing) {
                setModalMin(existing.min_discount_percent?.toString() || "10");
                setModalMax(existing.max_discount_percent?.toString() || "30");
            } else {
                setModalMin("10");
                setModalMax("30");
            }

            setModalError(null);
            setIsProductModalOpen(true);
        }
    };

    const handleModalSubmit = useCallback(() => {
        const min = parseFloat(modalMin);
        const max = parseFloat(modalMax);

        if (isNaN(min) || isNaN(max)) {
            setModalError("Discount values are required");
            return;
        }
        if (min < 0 || max > 100 || min > 100 || max < 0) {
            setModalError("Percents must be 0-100");
            return;
        }
        if (min > max) {
            setModalError("Min must be <= Max");
            return;
        }

        const existingRule = productRules.find(r => r.scope_id === selectedProduct.id);

        fetcher.submit(
            {
                intent: "add_product_rule",
                shopId: shopId.toString(),
                shopifyStoreId: shopifyStoreId.toString(),
                scope_id: selectedProduct.id,
                id: existingRule?.id || "",
                min_pct: modalMin,
                max_pct: modalMax,
            },
            { method: "post" }
        );
        setIsProductModalOpen(false);
    }, [modalMin, modalMax, selectedProduct, shopId, productRules, fetcher]);

    useEffect(() => {
        if (fetcher.data && !isSaving) {
            const intent = fetcher.formData?.get("intent");
            if (fetcher.data.success) {
                if (intent !== "delete_rule") {
                    setToastMessage("Changes saved");
                    setToastError(false);
                    setShowToast(true);
                }
            } else if (fetcher.data.error) {
                setToastMessage(fetcher.data.error);
                setToastError(true);
                setShowToast(true);
            }
        }
    }, [fetcher.data, isSaving]);

    const handleUpdateGlobal = useCallback(() => {
        fetcher.submit(
            {
                intent: "save_global",
                id: initialGlobal.id || "",
                shopId: shopId.toString(),
                shopifyStoreId: shopifyStoreId.toString(),
                min_discount_percent: minDiscount,
                max_discount_percent: maxDiscount,
                counter_strategy: strategy,
            },
            { method: "post" }
        );
    }, [fetcher, shopId, minDiscount, maxDiscount, strategy, initialGlobal.id]);

    const handleAddCategoryRule = useCallback(() => {
        if (!newCategoryScope) return;
        // Check if a rule for this category already exists
        const existingRule = categoryRules.find(r => r.scope_id === newCategoryScope);

        fetcher.submit(
            {
                intent: "add_category_rule",
                id: existingRule?.id || "",
                shopId: shopId.toString(),
                shopifyStoreId: shopifyStoreId.toString(),
                scope_id: newCategoryScope,
                min_pct: newCategoryMin,
                max_pct: newCategoryMax,
            },
            { method: "post" }
        );
    }, [fetcher, shopId, newCategoryScope, newCategoryMin, newCategoryMax, categoryRules, shopifyStoreId]);

    const handleUpdateCaptureSettings = useCallback(() => {
        fetcher.submit(
            {
                intent: "save_capture_settings",
                shopId: shopId.toString(),
                email_capture_round: emailCaptureRound,
                terms_and_conditions_link: termsLink,
            },
            { method: "post" }
        );
    }, [fetcher, shopId, emailCaptureRound, termsLink]);

    return (
        <Frame>
            <Page title="Negotiation Rules">
                <Layout>
                    {/* GLOBAL RULES */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Global Rules (Priority 0)</Text>
                                <Text as="p" tone="subdued">These rules apply to all products unless overridden.</Text>
                                <InlineStack align="end" gap="400">
                                    <div style={{ flex: 1 }}>
                                        <TextField
                                            label="Min Discount %"
                                            type="number"
                                            value={minDiscount}
                                            onChange={setMinDiscount}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <TextField
                                            label="Max Discount %"
                                            type="number"
                                            value={maxDiscount}
                                            onChange={setMaxDiscount}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <Select
                                            label="Counter Strategy"
                                            options={strategyOptions}
                                            value={strategy}
                                            onChange={setStrategy}
                                        />
                                    </div>
                                    <Button
                                        onClick={handleUpdateGlobal}
                                        loading={isSaving && fetcher.formData?.get("intent") === "save_global"}
                                        variant="primary"
                                    >
                                        Update Global
                                    </Button>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    {/* CATEGORY OVERRIDES */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Category Overrides (Priority 10)</Text>

                                {categoryRules.length > 0 && (
                                    <ResourceList
                                        resourceName={{ singular: 'rule', plural: 'rules' }}
                                        items={categoryRules}
                                        renderItem={(rule) => {
                                            const collection = collections.find(c => c.id === rule.scope_id);
                                            return (
                                                <ResourceItem id={rule.id}>
                                                    <InlineStack align="space-between" blockAlign="center">
                                                        <BlockStack gap="100">
                                                            <Text variant="bodyMd" fontWeight="bold">{collection?.title || "Unknown Collection"}</Text>
                                                            <Text tone="subdued">{rule.min_discount_percent}% - {rule.max_discount_percent}% Discount</Text>
                                                        </BlockStack>
                                                        <fetcher.Form method="post">
                                                            <input type="hidden" name="intent" value="delete_rule" />
                                                            <input type="hidden" name="id" value={rule.id} />
                                                            <Button icon={DeleteIcon} tone="critical" variant="tertiary" submit />
                                                        </fetcher.Form>
                                                    </InlineStack>
                                                </ResourceItem>
                                            );
                                        }}
                                    />
                                )}

                                <Divider />

                                <Box paddingBlockStart="200">
                                    <InlineStack gap="300" align="end">
                                        <div style={{ flex: 1 }}>
                                            <Select
                                                label="Select Category"
                                                options={collectionOptions}
                                                value={newCategoryScope}
                                                onChange={setNewCategoryScope}
                                            />
                                        </div>
                                        <div style={{ width: '80px' }}>
                                            <TextField
                                                label="Min %"
                                                type="number"
                                                value={newCategoryMin}
                                                onChange={setNewCategoryMin}
                                                autoComplete="off"
                                            />
                                        </div>
                                        <div style={{ width: '80px' }}>
                                            <TextField
                                                label="Max %"
                                                type="number"
                                                value={newCategoryMax}
                                                onChange={setNewCategoryMax}
                                                autoComplete="off"
                                            />
                                        </div>
                                        <Button
                                            onClick={handleAddCategoryRule}
                                            loading={isSaving && fetcher.formData?.get("intent") === "add_category_rule"}
                                            variant="primary"
                                        >
                                            Add Override
                                        </Button>
                                    </InlineStack>
                                </Box>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    {/* PRODUCT OVERRIDES */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Product Overrides (Priority 100)</Text>

                                {productRules.length > 0 && (
                                    <ResourceList
                                        resourceName={{ singular: 'rule', plural: 'rules' }}
                                        items={productRules}
                                        renderItem={(rule) => (
                                            <ResourceItem id={rule.id}>
                                                <InlineStack align="space-between" blockAlign="center">
                                                    <InlineStack gap="300" blockAlign="center">
                                                        <PolarisThumbnail
                                                            source={productDetails[rule.scope_id]?.image || ""}
                                                            alt={productDetails[rule.scope_id]?.title || "Product"}
                                                            size="small"
                                                        />
                                                        <BlockStack gap="100">
                                                            <Text variant="bodyMd" fontWeight="bold">
                                                                {productDetails[rule.scope_id]?.title || `Product ID: ${rule.scope_id.split('/').pop()}`}
                                                            </Text>
                                                            <Text tone="subdued">{rule.min_discount_percent}% - {rule.max_discount_percent}% Discount</Text>
                                                        </BlockStack>
                                                    </InlineStack>
                                                    <fetcher.Form method="post">
                                                        <input type="hidden" name="intent" value="delete_rule" />
                                                        <input type="hidden" name="id" value={rule.id} />
                                                        <Button icon={DeleteIcon} tone="critical" variant="tertiary" submit />
                                                    </fetcher.Form>
                                                </InlineStack>
                                            </ResourceItem>
                                        )}
                                    />
                                )}

                                <Divider />
                                <Box paddingBlockStart="200">
                                    <Button onClick={openResourcePicker} variant="primary">
                                        Add Product Override
                                    </Button>
                                </Box>

                                <Modal
                                    open={isProductModalOpen}
                                    onClose={() => setIsProductModalOpen(false)}
                                    title={`Set discounts for ${selectedProduct?.title}`}
                                    primaryAction={{
                                        content: 'Save Override',
                                        onAction: handleModalSubmit,
                                        loading: isSaving && fetcher.formData?.get("intent") === "add_product_rule"
                                    }}
                                    secondaryActions={[
                                        {
                                            content: 'Cancel',
                                            onAction: () => setIsProductModalOpen(false),
                                        },
                                    ]}
                                >
                                    <Modal.Section>
                                        <BlockStack gap="400">
                                            {selectedProduct && selectedProduct.images?.[0] && (
                                                <InlineStack align="center">
                                                    <PolarisThumbnail
                                                        source={selectedProduct.images[0].originalSrc || selectedProduct.images[0].url}
                                                        alt={selectedProduct.title}
                                                        size="large"
                                                    />
                                                </InlineStack>
                                            )}

                                            <InlineStack gap="400">
                                                <div style={{ flex: 1 }}>
                                                    <TextField
                                                        label="Min Discount %"
                                                        type="number"
                                                        value={modalMin}
                                                        onChange={setModalMin}
                                                        autoComplete="off"
                                                        helpText="Minimum discount allowed for this product"
                                                        error={modalError && modalError.includes("Min") ? modalError : null}
                                                    />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <TextField
                                                        label="Max Discount %"
                                                        type="number"
                                                        value={modalMax}
                                                        onChange={setModalMax}
                                                        autoComplete="off"
                                                        helpText="Maximum discount allowed for this product"
                                                        error={modalError && modalError.includes("Max") ? modalError : null}
                                                    />
                                                </div>
                                            </InlineStack>

                                            {modalError && !modalError.includes("Min") && !modalError.includes("Max") && (
                                                <Text tone="critical">{modalError}</Text>
                                            )}
                                        </BlockStack>
                                    </Modal.Section>
                                </Modal>
                            </BlockStack>
                        </Card>
                    </Layout.Section>

                    {/* LEAD CAPTURE & LEGAL */}
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <Text variant="headingMd" as="h2">Lead Capture & Legal</Text>
                                <Text as="p" tone="subdued">Configure when the bot will ask for the customer's email and set your store's terms and conditions link.</Text>
                                <BlockStack gap="400">
                                    <Select
                                        label="When should the bot ask for the user's email?"
                                        options={captureRoundOptions}
                                        value={emailCaptureRound}
                                        onChange={setEmailCaptureRound}
                                        helpText="Choose the optimal negotiation round to capture the email address."
                                    />
                                    <TextField
                                        label="Terms & Conditions Page URL (Optional)"
                                        value={termsLink}
                                        onChange={setTermsLink}
                                        placeholder="https://yourstore.com/policies/terms-of-service"
                                        autoComplete="url"
                                        helpText="If provided, customers must agree to these terms when submitting their email."
                                    />
                                    <InlineStack align="start">
                                        <Button
                                            onClick={handleUpdateCaptureSettings}
                                            loading={isSaving && fetcher.formData?.get("intent") === "save_capture_settings"}
                                            variant="primary"
                                        >
                                            Save Settings
                                        </Button>
                                    </InlineStack>
                                </BlockStack>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>
                {showToast && <Toast content={toastMessage} error={toastError} onDismiss={() => setShowToast(false)} />}
            </Page>
        </Frame>
    );
}
