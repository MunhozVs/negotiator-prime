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
  InlineError,
  Box,
  Text,
  Toast,
  Frame,
  Select,
} from "@shopify/polaris";
import supabase from "../supabase.server";
import { requireAdminShop } from "../shop-context.server";

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const BOT_PERSONALITIES = new Set(["friendly", "firm", "luxury"]);

function textValue(formData, key, maxLength) {
  return String(formData.get(key) || "").trim().slice(0, maxLength);
}

function integerValue(formData, key, fallback, min, max) {
  const value = Number.parseInt(formData.get(key) || String(fallback), 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export const loader = async ({ request }) => {
  const { shop } = await requireAdminShop(request);

  let { data: settings, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('store_id', shop.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load shop settings", { code: error.code });
    throw new Response("Unable to load settings", { status: 500 });
  }

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
      bot_personality: 'friendly',
    };
  }

  return { settings };
};

export const action = async ({ request }) => {
  const { shop } = await requireAdminShop(request);
  const formData = await request.formData();
  const headerColor = textValue(formData, "header_color", 7);
  const buttonColor = textValue(formData, "button_color", 7);
  const personality = textValue(formData, "bot_personality", 20);
  const avatarUrl = textValue(formData, "bot_avatar_url", 500);

  if (!COLOR_PATTERN.test(headerColor) || !COLOR_PATTERN.test(buttonColor)) {
    return { success: false, error: "Colors must use the #RRGGBB format" };
  }

  if (avatarUrl) {
    try {
      const url = new URL(avatarUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");
    } catch {
      return { success: false, error: "Avatar URL must be a valid HTTP or HTTPS URL" };
    }
  }

  const updates = {
    store_id: shop.id,
    chatbot_name: textValue(formData, "chatbot_name", 80),
    bot_avatar_url: avatarUrl,
    header_color: headerColor,
    button_color: buttonColor,
    trigger_delay: integerValue(formData, "trigger_delay", 3, 0, 60),
    enable_mobile: formData.get("enable_mobile") === "true",
    session_cooldown: integerValue(formData, "session_cooldown", 24, 0, 720),
    teaser_headline: textValue(formData, "teaser_headline", 160),
    cta_label: textValue(formData, "cta_label", 80),
    bot_personality: BOT_PERSONALITIES.has(personality) ? personality : "friendly",
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
  const { settings } = useLoaderData();
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
            { ...formState, enable_mobile: formState.enable_mobile.toString() },
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
                  <Select
                    label="Bot Personality"
                    options={[
                      { label: 'Friendly', value: 'friendly' },
                      { label: 'Firm', value: 'firm' },
                      { label: 'Luxury', value: 'luxury' },
                    ]}
                    value={formState.bot_personality || 'friendly'}
                    onChange={handleFieldChange("bot_personality")}
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
                        value={formState.header_color}
                        onChange={(val) => {
                          // Accept with or without '#', always store as #RRGGBB
                          const normalized = val.startsWith('#') ? val : '#' + val;
                          handleFieldChange("header_color")(normalized);
                        }}
                        autoComplete="off"
                        placeholder="#1B2A4A"
                        prefix={
                          <div style={{ position: 'relative', width: 24, height: 24 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 4,
                              backgroundColor: formState.header_color,
                              border: '1px solid #ccc', cursor: 'pointer'
                            }} />
                            <input
                              type="color"
                              value={formState.header_color}
                              onChange={(e) => handleFieldChange("header_color")(e.target.value)}
                              style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                opacity: 0, cursor: 'pointer', padding: 0, border: 'none'
                              }}
                            />
                          </div>
                        }
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Button Color"
                        value={formState.button_color}
                        onChange={(val) => {
                          const normalized = val.startsWith('#') ? val : '#' + val;
                          handleFieldChange("button_color")(normalized);
                        }}
                        autoComplete="off"
                        placeholder="#C9A84C"
                        prefix={
                          <div style={{ position: 'relative', width: 24, height: 24 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: 4,
                              backgroundColor: formState.button_color,
                              border: '1px solid #ccc', cursor: 'pointer'
                            }} />
                            <input
                              type="color"
                              value={formState.button_color}
                              onChange={(e) => handleFieldChange("button_color")(e.target.value)}
                              style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                opacity: 0, cursor: 'pointer', padding: 0, border: 'none'
                              }}
                            />
                          </div>
                        }
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
