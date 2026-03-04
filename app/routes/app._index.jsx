import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import supabase from "../supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // 1. Ensure shop exists in 'shops' table and get its UUID
  let { data: shopRecord, error: shopError } = await supabase
    .from('shops')
    .select('id')
    .eq('shop_domain', shopDomain)
    .single();

  if (!shopRecord) {
    // Create shop if not exists
    const { data: newShop, error: createError } = await supabase
      .from('shops')
      .insert([{ shop_domain: shopDomain }])
      .select()
      .single();

    if (createError) throw new Error("Error ensuring shop: " + createError.message);
    shopRecord = newShop;
  }

  // 2. Fetch or initialize settings
  let { data: settings, error: settingsError } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('store_id', shopRecord.id)
    .single();

  if (!settings && !settingsError) {
    // Return defaults if none found
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

  return (
    <s-page heading="General Settings">
      <s-button
        slot="primary-action"
        loading={isSaving ? "true" : undefined}
        onClick={() => document.getElementById("settings-form").requestSubmit()}
      >
        Save Settings
      </s-button>

      <fetcher.Form method="post" id="settings-form">
        <input type="hidden" name="shopId" value={shopId} />

        <s-section heading="Basic Identity">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Chatbot Name / Title"
              name="chatbot_name"
              value={settings.chatbot_name}
              help-text="Display name in the chat header"
            />
            <s-text-field
              label="Bot Avatar URL"
              name="bot_avatar_url"
              value={settings.bot_avatar_url}
              help-text="Public URL for the custom avatar image"
            />
          </s-stack>
        </s-section>

        <s-section heading="Branding & Colors">
          <s-stack direction="inline" gap="base">
            <s-text-field
              label="Header Color"
              name="header_color"
              type="color"
              value={settings.header_color}
            />
            <s-text-field
              label="Button Color"
              name="button_color"
              type="color"
              value={settings.button_color}
            />
          </s-stack>
        </s-section>

        <s-section heading="Behavior & Triggers">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Trigger Delay (seconds)"
              name="trigger_delay"
              type="number"
              value={settings.trigger_delay}
            />
            <s-text-field
              label="Session Cooldown (hours)"
              name="session_cooldown"
              type="number"
              value={settings.session_cooldown}
            />
            <s-checkbox
              label="Enable on mobile devices"
              name="enable_mobile"
              value="true"
              checked={settings.enable_mobile ? "true" : undefined}
            />
          </s-stack>
        </s-section>

        <s-section heading="Teaser & CTA">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Teaser Headline"
              name="teaser_headline"
              value={settings.teaser_headline}
              help-text="Hook text on teaser card"
            />
            <s-text-field
              label="CTA Label"
              name="cta_label"
              value={settings.cta_label}
              help-text="Button text (e.g., 'Claim My Best Price')"
            />
          </s-stack>
        </s-section>
      </fetcher.Form>

      {fetcher.data?.success && !isSaving && (
        <s-banner tonality="success" title="Settings saved successfully" />
      )}
      {fetcher.data?.error && (
        <s-banner tonality="critical" title="Error saving settings">
          {fetcher.data.error}
        </s-banner>
      )}
    </s-page>
  );
}
