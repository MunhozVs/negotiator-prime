import { 
  Card, 
  Text, 
  BlockStack, 
  List, 
  Box, 
  InlineStack, 
  Divider,
  Badge
} from "@shopify/polaris";

export function RecentActivity({ activity }) {
  const { latest_leads = [], latest_orders = [] } = activity || {};

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card>
      <InlineStack gap="600" wrap={false}>
        <Box width="50%">
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Latest Leads</Text>
            {latest_leads.length === 0 ? (
              <Text tone="subdued">No recent leads.</Text>
            ) : (
              <List type="bullet">
                {latest_leads.map((lead, i) => (
                  <List.Item key={i}>
                    <InlineStack gap="200">
                      <Text variant="bodyMd" fontWeight="bold">{lead.email}</Text>
                      <Text variant="bodySm" tone="subdued">{formatDate(lead.created_at)}</Text>
                    </InlineStack>
                  </List.Item>
                ))}
              </List>
            )}
          </BlockStack>
        </Box>

        <Divider vertical />

        <Box width="50%">
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Recent Orders</Text>
            {latest_orders.length === 0 ? (
              <Text tone="subdued">No recent orders.</Text>
            ) : (
              <List type="bullet">
                {latest_orders.map((order, i) => (
                  <List.Item key={i}>
                    <BlockStack gap="100">
                      <InlineStack gap="200" align="center">
                        <Text variant="bodyMd" fontWeight="bold">
                          {order.product_title?.slice(0, 30) || 'Unknown Product'}...
                        </Text>
                        <Badge tone={order.status === 'paid' ? 'success' : 'attention'}>
                          {order.status === 'paid' ? 'Paid' : 'Draft'}
                        </Badge>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        {Number(order.approved_price).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} • {formatDate(order.created_at)}
                      </Text>
                    </BlockStack>
                  </List.Item>
                ))}
              </List>
            )}
          </BlockStack>
        </Box>
      </InlineStack>
    </Card>
  );
}
