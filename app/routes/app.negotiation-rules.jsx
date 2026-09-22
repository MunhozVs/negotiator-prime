import { useState, useCallback, useEffect } from "react";
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
    Modal,
    Thumbnail as PolarisThumbnail,
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import supabase from "../supabase.server";
import { getShopifyStoreId, requireAdminShop } from "../shop-context.server";

const STRATEGIES = new Set(["split_difference", "hold_firm", "concede_once"]);
const CAPTURE_ROUNDS = new Set([
    "pre_start",
    "round_1",
    "round_2",
    "round_3",
    "round_4",
    "post_end",
    "never",
]);

function parseDiscountRange(formData, minKey, maxKey) {
    const min = Number(formData.get(minKey));
    const max = Number(formData.get(maxKey));

    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) {
        return null;
    }

    return { min, max };
}

async function saveTenantRule({ id, shopId, values }) {
    if (id && id !== "null") {
        const { data, error } = await supabase
            .from("discount_rules")
            .update(values)
            .eq("id", id)
            .eq("store_id", shopId)
            .select("id")
            .maybeSingle();

        return { data, error, notFound: !data && !error };
    }

    const { data, error } = await supabase
        .from("discount_rules")
        .insert({ ...values, store_id: shopId })
        .select("id")
        .single();

    return { data, error, notFound: false };
}

export const loader = async ({ request }) => {
    const { admin, shop } = await requireAdminShop(request);

    const { data: rulesData, error: rulesError } = await supabase
        .from('discount_rules')
        .select('*')
        .eq('store_id', shop.id)
        .order('priority', { ascending: false });

    if (rulesError) {
        console.error("Unable to load discount rules", { code: rulesError.code });
        throw new Response("Unable to load discount rules", { status: 500 });
    }

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

    // 5. Fetch Shop Settings for Lead Capture
    const { data: shopSettings } = await supabase
        .from('shop_settings')
        .select('email_capture_round, terms_and_conditions_link')
        .eq('store_id', shop.id)
        .maybeSingle();

    return {
        rules,
        collections,
        productDetails,
        shopSettings: shopSettings || {}
    };
};

export const action = async ({ request }) => {
    const { admin, shop } = await requireAdminShop(request);
    const formData = await request.formData();
    const intent = formData.get("intent");
    const id = String(formData.get("id") || "");

    if (intent === "save_global") {
        const range = parseDiscountRange(formData, "min_discount_percent", "max_discount_percent");
        const strategy = formData.get("counter_strategy");

        if (!range || !STRATEGIES.has(strategy)) {
            return { success: false, error: "Invalid global rule" };
        }

        const result = await saveTenantRule({
          id,
          shopId: shop.id,
          values: {
            shopify_store_id: await getShopifyStoreId(admin),
            scope_type: 'global',
            scope_id: null,
            min_discount_percent: range.min,
            max_discount_percent: range.max,
            counter_strategy: strategy,
            is_active: true,
            priority: 0
          },
        });

        if (result.error || result.notFound) {
            console.error("Unable to save global rule", { code: result.error?.code });
            return { success: false, error: "Unable to save global rule" };
        }
    } else if (intent === "save_capture_settings") {
        const emailCaptureRound = String(formData.get("email_capture_round") || "");
        const termsLink = String(formData.get("terms_and_conditions_link") || "").trim().slice(0, 500);

        if (!CAPTURE_ROUNDS.has(emailCaptureRound)) {
            return { success: false, error: "Invalid lead capture setting" };
        }

        if (termsLink) {
            try {
                const url = new URL(termsLink);
                if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Invalid protocol");
            } catch {
                return { success: false, error: "Terms URL must be a valid HTTP or HTTPS URL" };
            }
        }

        const { error } = await supabase.from('shop_settings').upsert({
            store_id: shop.id,
            email_capture_round: emailCaptureRound,
            terms_and_conditions_link: termsLink,
        }, { onConflict: 'store_id' });

        if (error) {
            console.error("Unable to save capture settings", { code: error.code });
            return { success: false, error: "Unable to save capture settings" };
        }
    } else if (intent === "delete_rule") {
        const { error } = await supabase
            .from('discount_rules')
            .delete()
            .eq('id', id)
            .eq('store_id', shop.id);

        if (error) {
            console.error("Unable to delete rule", { code: error.code });
            return { success: false, error: "Unable to delete rule" };
        }
    } else if (intent === "add_category_rule" || intent === "add_product_rule") {
        const isProduct = intent === "add_product_rule";
        const scopeId = String(formData.get("scope_id") || "");
        const expectedPrefix = isProduct ? "gid://shopify/Product/" : "gid://shopify/Collection/";
        const range = parseDiscountRange(formData, "min_pct", "max_pct");

        if (!range || !scopeId.startsWith(expectedPrefix)) {
            return { success: false, error: "Invalid scoped rule" };
        }

        const result = await saveTenantRule({
            id,
            shopId: shop.id,
            values: {
                shopify_store_id: await getShopifyStoreId(admin),
                scope_type: isProduct ? 'product' : 'category',
                scope_id: scopeId,
                min_discount_percent: range.min,
                max_discount_percent: range.max,
                counter_strategy: 'split_difference',
                is_active: true,
                priority: isProduct ? 100 : 10,
            },
        });

        if (result.error || result.notFound) {
            console.error("Unable to save scoped rule", { code: result.error?.code });
            return { success: false, error: "Unable to save scoped rule" };
        }
    } else {
        return { success: false, error: "Unknown action" };
    }

    return { success: true };
};

// ProductRuleRow is no longer used for search results
// Existing rules are listed directly in the parent component for simplicity


export default function NegotiationRules() {
    const { rules, collections, productDetails, shopSettings } = useLoaderData();
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
                scope_id: selectedProduct.id,
                id: existingRule?.id || "",
                min_pct: modalMin,
                max_pct: modalMax,
            },
            { method: "post" }
        );
        setIsProductModalOpen(false);
    }, [modalMin, modalMax, selectedProduct, productRules, fetcher]);

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
    }, [fetcher.data, fetcher.formData, isSaving]);

    const handleUpdateGlobal = useCallback(() => {
        fetcher.submit(
            {
                intent: "save_global",
                id: initialGlobal.id || "",
                min_discount_percent: minDiscount,
                max_discount_percent: maxDiscount,
                counter_strategy: strategy,
            },
            { method: "post" }
        );
    }, [fetcher, minDiscount, maxDiscount, strategy, initialGlobal.id]);

    const handleAddCategoryRule = useCallback(() => {
        if (!newCategoryScope) return;
        // Check if a rule for this category already exists
        const existingRule = categoryRules.find(r => r.scope_id === newCategoryScope);

        fetcher.submit(
            {
                intent: "add_category_rule",
                id: existingRule?.id || "",
                scope_id: newCategoryScope,
                min_pct: newCategoryMin,
                max_pct: newCategoryMax,
            },
            { method: "post" }
        );
    }, [fetcher, newCategoryScope, newCategoryMin, newCategoryMax, categoryRules]);

    const handleUpdateCaptureSettings = useCallback(() => {
        fetcher.submit(
            {
                intent: "save_capture_settings",
                email_capture_round: emailCaptureRound,
                terms_and_conditions_link: termsLink,
            },
            { method: "post" }
        );
    }, [fetcher, emailCaptureRound, termsLink]);

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
                                <Text as="p" tone="subdued">Configure when the bot will ask for the customer&apos;s email and set your store&apos;s terms and conditions link.</Text>
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
