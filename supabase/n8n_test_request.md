# Teste de RPC para n8n / HTTP Request (SIMPLIFICADO)

Agora a RPC usa apenas o **store_id** (ID numérico do Shopify).

### Configuração do Node no n8n:
- **Method**: POST
- **URL**: `https://npkkeoghzbciiwiouuep.supabase.co/rest/v1/rpc/get_dashboard_analytics`
- **Headers**:
  - `apikey**: `SUA_SERVICE_KEY`
  - `Authorization`: `Bearer SUA_SERVICE_KEY`
  - `Content-Type**: `application/json`

### Payload (JSON):
```json
{
  "p_store_id": "97944830257",
  "p_start_date": "2024-01-01T00:00:00Z",
  "p_end_date": "2026-12-31T23:59:59Z"
}
```

> [!NOTE]
> Removi a necessidade do `p_shop_id` (UUID). Basta passar o ID numérico que você vê na URL do Shopify ou nos logs (ex: `97944830257`).
