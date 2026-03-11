-- ============================================================
-- LIMPEZA: Remove todas as versões anteriores para evitar conflitos de assinatura
-- ============================================================
DROP FUNCTION IF EXISTS public.get_dashboard_analytics(p_store_id UUID, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_dashboard_analytics(p_shop_id UUID, p_shopify_id TEXT, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_dashboard_analytics(p_store_id TEXT, p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ);

-- ============================================================
-- RPC: get_dashboard_analytics (VERSÃO FINAL CORRIGIDA COM SCHEMA REAL)
-- Execute este SQL completo no seu Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_analytics(
  p_store_id TEXT,
  p_start_date TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  v_total_leads INT;
  v_active_negotiations INT;
  v_total_revenue NUMERIC;
  v_potential_revenue NUMERIC;
  v_avg_discount NUMERIC;
  v_conversion_rate NUMERIC;
  v_total_chats INT;
  v_orders_drafted INT;
  v_orders_paid INT;
  v_avg_rounds NUMERIC;
  v_abandonment_rate NUMERIC;
  v_revenue_over_time JSONB;
  v_leads_over_time JSONB;
  v_top_products JSONB;
  v_latest_leads JSONB;
  v_latest_orders JSONB;
BEGIN

  -- ============ 1. KPIs BÁSICOS ============

  -- Total leads (da tabela leads)
  SELECT COUNT(*)
  INTO v_total_leads
  FROM leads
  WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- Negociações Ativas (chats que não viraram pedido pago)
  SELECT COUNT(DISTINCT chat_id)
  INTO v_active_negotiations
  FROM chat_interactions
  WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND NOT EXISTS (
      SELECT 1 FROM negotiation_orders no2
      WHERE (no2.chat_id)::TEXT = (chat_interactions.chat_id)::TEXT 
        AND no2.status = 'paid'
    );

  -- Receita Total (pedidos pagos)
  SELECT COALESCE(SUM(approved_price), 0)
  INTO v_total_revenue
  FROM negotiation_orders
  WHERE store_id = p_store_id
    AND status = 'paid'
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- Receita Potencial (pedidos ativos/draft)
  SELECT COALESCE(SUM(approved_price), 0)
  INTO v_potential_revenue
  FROM negotiation_orders
  WHERE store_id = p_store_id
    AND status = 'active'
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- Desconto Médio (apenas pagos)
  SELECT COALESCE(
    AVG(
      CASE WHEN original_price > 0
        THEN ((original_price - approved_price) / original_price) * 100
        ELSE 0
      END
    ), 0
  )
  INTO v_avg_discount
  FROM negotiation_orders
  WHERE store_id = p_store_id
    AND status = 'paid'
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- Contagem de pedidos
  SELECT COUNT(*) INTO v_orders_paid FROM negotiation_orders WHERE store_id = p_store_id AND status = 'paid' AND created_at BETWEEN p_start_date AND p_end_date;
  SELECT COUNT(*) INTO v_orders_drafted FROM negotiation_orders WHERE store_id = p_store_id AND status = 'active' AND created_at BETWEEN p_start_date AND p_end_date;

  -- Taxa de Conversão (Pedidos Pagos / Total Leads)
  IF v_total_leads > 0 THEN 
    v_conversion_rate := (v_orders_paid::NUMERIC / v_total_leads) * 100; 
  ELSE 
    v_conversion_rate := 0; 
  END IF;

  -- ============ 2. FUNNEL ============
  
  -- Total de chats iniciados
  SELECT COUNT(DISTINCT chat_id) 
  INTO v_total_chats 
  FROM chat_interactions 
  WHERE store_id = p_store_id 
    AND created_at BETWEEN p_start_date AND p_end_date;

  -- ============ 3. BOT PERFORMANCE ============

  -- Média de rounds para converter (Join com chat_interactions para pegar round)
  SELECT COALESCE(AVG(max_round), 0)
  INTO v_avg_rounds
  FROM (
    SELECT MAX(ci.current_round) as max_round
    FROM negotiation_orders no
    JOIN chat_interactions ci ON (no.chat_id)::TEXT = (ci.chat_id)::TEXT
    WHERE no.store_id = p_store_id
      AND no.status = 'paid'
      AND no.created_at BETWEEN p_start_date AND p_end_date
    GROUP BY no.chat_id
  ) t;

  -- Taxa de Abandono (Chats que não viraram nem draft nem pago)
  IF v_total_chats > 0 THEN 
    v_abandonment_rate := ((v_total_chats - (v_orders_drafted + v_orders_paid))::NUMERIC / v_total_chats) * 100; 
  ELSE 
    v_abandonment_rate := 0; 
  END IF;

  -- ============ 4. CHARTS ============

  -- Receita ao longo do tempo
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) 
  INTO v_revenue_over_time 
  FROM (
    SELECT 
      created_at::date AS date, 
      SUM(approved_price) AS revenue, 
      COUNT(*) AS orders 
    FROM negotiation_orders 
    WHERE store_id = p_store_id AND status = 'paid' AND created_at BETWEEN p_start_date AND p_end_date 
    GROUP BY created_at::date ORDER BY date
  ) t;

  -- Leads ao longo do tempo
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) 
  INTO v_leads_over_time 
  FROM (
    SELECT created_at::date AS date, COUNT(*) AS count 
    FROM leads 
    WHERE store_id = p_store_id AND created_at BETWEEN p_start_date AND p_end_date 
    GROUP BY created_at::date ORDER BY date
  ) t;

  -- ============ 5. TOP PRODUCTS ============
  -- Corrigido: Join com chat_interactions para buscar o product_title
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) 
  INTO v_top_products 
  FROM (
    SELECT 
      COALESCE(ci.product_title, 'Produto ID: ' || no.product_id) AS product_title, 
      COUNT(DISTINCT no.chat_id) AS negotiations_count, 
      COUNT(DISTINCT no.id) FILTER (WHERE no.status = 'paid') AS sales_count, 
      COALESCE(SUM(no.approved_price) FILTER (WHERE no.status = 'paid'), 0) AS revenue 
    FROM negotiation_orders no
    LEFT JOIN (
      -- Subquery para pegar o título único por chat_id/product_id
      SELECT chat_id, product_id, product_title 
      FROM chat_interactions 
      WHERE store_id = p_store_id
      GROUP BY chat_id, product_id, product_title
    ) ci ON (no.chat_id)::TEXT = (ci.chat_id)::TEXT
    WHERE no.store_id = p_store_id 
      AND no.created_at BETWEEN p_start_date AND p_end_date 
    GROUP BY ci.product_title, no.product_id
    ORDER BY revenue DESC 
    LIMIT 10
  ) t;

  -- ============ 6. RECENT ACTIVITY ============

  -- Últimos 5 leads
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) 
  INTO v_latest_leads 
  FROM (
    SELECT id, lead_email as email, created_at 
    FROM leads 
    WHERE store_id = p_store_id 
    ORDER BY created_at DESC LIMIT 5
  ) t;

  -- Últimas 5 orders (com título via chat_interactions)
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) 
  INTO v_latest_orders 
  FROM (
    SELECT 
      no.id, 
      COALESCE(ci.product_title, 'Produto ID: ' || no.product_id) AS product_title, 
      no.approved_price, 
      no.original_price, 
      no.status, 
      no.created_at 
    FROM negotiation_orders no 
    LEFT JOIN (
      SELECT chat_id, product_title FROM chat_interactions GROUP BY chat_id, product_title
    ) ci ON (no.chat_id)::TEXT = (ci.chat_id)::TEXT
    WHERE no.store_id = p_store_id 
    ORDER BY no.created_at DESC 
    LIMIT 5
  ) t;

  -- ============ FINAL BUILD ============

  result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_leads_captured', v_total_leads,
      'active_negotiations', v_active_negotiations,
      'total_revenue', ROUND(v_total_revenue, 2),
      'potential_revenue', ROUND(v_potential_revenue, 2),
      'avg_discount_percent', ROUND(v_avg_discount, 1),
      'conversion_rate', ROUND(v_conversion_rate, 1)
    ),
    'funnel_metrics', jsonb_build_object(
      'total_chats_started', v_total_chats,
      'leads_captured', v_total_leads,
      'orders_drafted', v_orders_drafted,
      'orders_paid', v_orders_paid
    ),
    'charts', jsonb_build_object(
      'revenue_over_time', v_revenue_over_time,
      'leads_over_time', v_leads_over_time
    ),
    'top_products', v_top_products,
    'bot_performance', jsonb_build_object(
      'avg_rounds_to_convert', ROUND(v_avg_rounds, 1),
      'abandonment_rate', ROUND(v_abandonment_rate, 1)
    ),
    'recent_activity', jsonb_build_object(
      'latest_leads', v_latest_leads,
      'latest_orders', v_latest_orders
    )
  );

  RETURN result;
END;
$$;
