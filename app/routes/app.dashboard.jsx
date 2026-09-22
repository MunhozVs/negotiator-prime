import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  InlineStack,
  Box,
  SkeletonBodyText,
  Banner,
  Frame,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import supabase from "../supabase.server";

// Dashboard Components
import { KpiCards } from "../components/dashboard/KpiCards";
import { ConversionFunnel } from "../components/dashboard/ConversionFunnel";
import { RevenueChart } from "../components/dashboard/RevenueChart";
import { TopProducts } from "../components/dashboard/TopProducts";
import { BotPerformance } from "../components/dashboard/BotPerformance";
import { RecentActivity } from "../components/dashboard/RecentActivity";

export const loader = async ({ request }) => {
  // 1. Fetch Shopify Store ID (store_id)
  const { admin } = await authenticate.admin(request);
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
  const storeId = shopifyGid.split('/').pop();

  // 2. Parse date range from URL params (defaults: last 30 days)
  const url = new URL(request.url);
  const endDate = url.searchParams.get("end_date") || new Date().toISOString();
  const startDate = url.searchParams.get("start_date") ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 3. Call the RPC with store_id only
  const { data: analytics, error: rpcError } = await supabase
    .rpc('get_dashboard_analytics', {
      p_store_id: storeId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

  if (rpcError) {
    console.error("Dashboard RPC Error:", rpcError);
    return {
      analytics: null,
      error: rpcError.message,
      dateRange: { startDate, endDate },
    };
  }

  return {
    analytics,
    error: null,
    dateRange: { startDate, endDate },
  };
};

export default function Dashboard() {
  const { analytics, error } = useLoaderData();

  return (
    <Frame>
      <Page title="Dashboard">
        <Layout>
          {error && (
            <Layout.Section>
              <Banner tone="critical">
                <p>Unable to load the dashboard: {error}</p>
              </Banner>
            </Layout.Section>
          )}

          {!analytics && !error && (
            <Layout.Section>
              <Card>
                <SkeletonBodyText lines={4} />
              </Card>
            </Layout.Section>
          )}

          {analytics && (
            <>
              <Layout.Section>
                <KpiCards kpis={analytics.kpis} />
              </Layout.Section>

              <Layout.Section variant="oneHalf">
                <RevenueChart data={analytics.charts?.revenue_over_time} />
              </Layout.Section>

              <Layout.Section variant="oneThird">
                <ConversionFunnel metrics={analytics.funnel_metrics} />
              </Layout.Section>

              <Layout.Section>
                 <InlineStack gap="400" wrap={false}>
                    <Box width="60%">
                      <TopProducts products={analytics.top_products} />
                    </Box>
                    <Box width="40%">
                       <BotPerformance performance={analytics.bot_performance} />
                    </Box>
                 </InlineStack>
              </Layout.Section>

              <Layout.Section>
                <RecentActivity activity={analytics.recent_activity} />
              </Layout.Section>
            </>
          )}
        </Layout>
      </Page>
    </Frame>
  );
}
