CREATE OR REPLACE FUNCTION public.get_negotiation_state(
  p_store_id TEXT,
  p_product_id TEXT,
  p_category_id TEXT,
  p_chat_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT;
  v_email_capture_round TEXT;
  v_discount_rule RECORD;
BEGIN
  SELECT email
  INTO v_email
  FROM public.chat_interactions
  WHERE id::TEXT = p_chat_id OR chat_id::TEXT = p_chat_id
  LIMIT 1;

  SELECT *
  INTO v_discount_rule
  FROM public.discount_rules
  WHERE shopify_store_id = p_store_id
    AND (
      (scope_type = 'product' AND scope_id = p_product_id)
      OR (scope_type = 'category' AND scope_id = p_category_id)
      OR scope_type = 'global'
    )
  ORDER BY CASE
    WHEN scope_type = 'product' THEN 1
    WHEN scope_type = 'category' THEN 2
    WHEN scope_type = 'global' THEN 3
  END
  LIMIT 1;

  IF FOUND THEN
    SELECT email_capture_round
    INTO v_email_capture_round
    FROM public.shop_settings
    WHERE store_id = v_discount_rule.store_id
    LIMIT 1;
  END IF;

  IF v_discount_rule IS NOT NULL THEN
    RETURN (
      to_jsonb(v_discount_rule) || jsonb_build_object(
        'email', v_email,
        'email_capture_round', v_email_capture_round
      )
    )::JSON;
  END IF;

  RETURN json_build_object(
    'email', v_email,
    'email_capture_round', v_email_capture_round
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_negotiation_state(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_negotiation_state(TEXT, TEXT, TEXT, TEXT)
  TO service_role;
