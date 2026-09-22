import supabase from "../supabase.server";
import { jsonResponse, requireAppProxyShop } from "../shop-context.server";

const PUBLIC_SETTINGS = [
  "chatbot_name",
  "bot_avatar_url",
  "header_color",
  "button_color",
  "trigger_delay",
  "enable_mobile",
  "session_cooldown",
  "teaser_headline",
  "cta_label",
  "bot_personality",
  "email_capture_round",
  "terms_and_conditions_link",
].join(",");

export const loader = async ({ request }) => {
  const { shop } = await requireAppProxyShop(request);

  const [{ data: settings, error: settingsError }, { data: globalRule, error: ruleError }] =
    await Promise.all([
      supabase
        .from("shop_settings")
        .select(PUBLIC_SETTINGS)
        .eq("store_id", shop.id)
        .maybeSingle(),
      supabase
        .from("discount_rules")
        .select("min_discount_percent, max_discount_percent, counter_strategy")
        .eq("store_id", shop.id)
        .eq("scope_type", "global")
        .maybeSingle(),
    ]);

  if (settingsError || ruleError) {
    console.error("Unable to load public settings", {
      settingsCode: settingsError?.code,
      ruleCode: ruleError?.code,
    });
    return jsonResponse({ error: "Unable to load settings" }, { status: 500 });
  }

  return jsonResponse({
    settings: settings || {},
    global_rules: globalRule || {
      min_discount_percent: 5,
      max_discount_percent: 20,
      counter_strategy: "split_difference",
    },
  });
};

export const action = async () =>
  jsonResponse({ error: "Method not allowed" }, { status: 405 });
