import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  InlineStack,
  Checkbox,
  Button,
  InlineError,
  Box,
  Text,
  Divider,
  Toast,
  Frame,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import supabase from "../supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // 1. Ensure shop exists
  let { data: shopRecord, error: shopError } = await supabase
    .from('shops')
    .select('id')
    .eq('shop_domain', shopDomain)
    .single();

  if (!shopRecord) {
    const { data: newShop, error: createError } = await supabase
      .from('shops')
      .insert([{ shop_domain: shopDomain }])
      .select()
      .single();

    if (createError) throw new Error("Error ensuring shop: " + createError.message);
    shopRecord = newShop;
  }

  // 2. Fetch settings
  let { data: settings, error: settingsError } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('store_id', shopRecord.id)
    .single();

  if (!settings) {
    settings = {
      chatbot_name: 'Negotiator Prime',
      bot_avatar_url: '',
      header_color: '#1B2A4A',
      button_color: '#C9A84C',
      trigger_delay: 3,
      enable_mobile: true,
      session_cooldown: 24,
      teaser_headline: 'Negotiate this price!',
      cta_label: 'Claim My Best Price',
    };
  }

  return { settings, shopId: shopRecord.id };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shopId = formData.get("shopId");

  const updates = {
    store_id: shopId,
    chatbot_name: formData.get("chatbot_name"),
    bot_avatar_url: formData.get("bot_avatar_url"),
    header_color: formData.get("header_color"),
    button_color: formData.get("button_color"),
    trigger_delay: parseInt(formData.get("trigger_delay") || "3", 10),
    enable_mobile: formData.get("enable_mobile") === "true",
    session_cooldown: parseInt(formData.get("session_cooldown") || "24", 10),
    teaser_headline: formData.get("teaser_headline"),
    cta_label: formData.get("cta_label"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('shop_settings')
    .upsert(updates, { onConflict: 'store_id' });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
};

export default function Index() {
  const { settings, shopId } = useLoaderData();
  const fetcher = useFetcher();
  const isSaving = fetcher.state === "submitting";

  const [formState, setFormState] = useState(settings);
  const [showToast, setShowToast] = useState(false);

  const toggleToast = useCallback(() => setShowToast((active) => !active), []);

  useEffect(() => {
    if (fetcher.data?.success && !isSaving) {
      setShowToast(true);
    }
  }, [fetcher.data, isSaving]);

  const handleFieldChange = (field) => (value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleCheckboxChange = (field) => (value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Frame>
      <Page
        title="General Settings"
        primaryAction={{
          content: "Save Settings",
          onAction: () => fetcher.submit(
            { ...formState, shopId, enable_mobile: formState.enable_mobile.toString() },
            { method: "post" }
          ),
          loading: isSaving,
        }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Basic Identity</Text>
                  <TextField
                    label="Chatbot Name / Title"
                    value={formState.chatbot_name}
                    onChange={handleFieldChange("chatbot_name")}
                    helpText="Display name in the chat header"
                    autoComplete="off"
                  />
                  <TextField
                    label="Bot Avatar URL"
                    value={formState.bot_avatar_url}
                    onChange={handleFieldChange("bot_avatar_url")}
                    helpText="Public URL for the custom avatar image"
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Branding & Colors</Text>
                  <InlineStack gap="400">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Header Color"
                        type="color"
                        value={formState.header_color}
                        onChange={handleFieldChange("header_color")}
                        autoComplete="off"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Button Color"
                        type="color"
                        value={formState.button_color}
                        onChange={handleFieldChange("button_color")}
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Behavior & Triggers</Text>
                  <TextField
                    label="Trigger Delay (seconds)"
                    type="number"
                    value={formState.trigger_delay.toString()}
                    onChange={handleFieldChange("trigger_delay")}
                    autoComplete="off"
                  />
                  <TextField
                    label="Session Cooldown (hours)"
                    type="number"
                    value={formState.session_cooldown.toString()}
                    onChange={handleFieldChange("session_cooldown")}
                    autoComplete="off"
                  />
                  <Checkbox
                    label="Enable on mobile devices"
                    checked={formState.enable_mobile}
                    onChange={handleCheckboxChange("enable_mobile")}
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Teaser & CTA</Text>
                  <TextField
                    label="Teaser Headline"
                    value={formState.teaser_headline}
                    onChange={handleFieldChange("teaser_headline")}
                    helpText="Hook text on teaser card"
                    autoComplete="off"
                  />
                  <TextField
                    label="CTA Label"
                    value={formState.cta_label}
                    onChange={handleFieldChange("cta_label")}
                    helpText="Button text (e.g., 'Claim My Best Price')"
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
        {showToast && (
          <Toast content="Settings saved successfully" onDismiss={toggleToast} />
        )}
        {fetcher.data?.error && (
          <Box paddingBlockStart="400">
            <InlineError message={fetcher.data.error} fieldID="settings-form" />
          </Box>
        )}
      </Page>
    </Frame>
  );
}
