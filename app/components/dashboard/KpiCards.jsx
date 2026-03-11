import { Card, Text, BlockStack, InlineGrid, Box, Icon, InlineStack } from "@shopify/polaris";
import { 
  PersonFilledIcon, 
  ChatIcon, 
  CashDollarIcon, 
  OrderIcon 
} from "@shopify/polaris-icons";

export function KpiCards({ kpis, loading }) {
  const cards = [
    {
      title: "Total Leads",
      value: kpis?.total_leads_captured ?? 0,
      icon: PersonFilledIcon,
      tone: "info",
      label: "Captured contacts"
    },
    {
      title: "Active Negotiations",
      value: kpis?.active_negotiations ?? 0,
      icon: ChatIcon,
      tone: "warning",
      label: "In progress"
    },
    {
      title: "Total Revenue",
      value: `$${Number(kpis?.total_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      icon: CashDollarIcon,
      tone: "success",
      label: "Confirmed sales"
    },
    {
      title: "Conversion Rate",
      value: `${kpis?.conversion_rate ?? 0}%`,
      icon: OrderIcon,
      tone: "attention",
      label: "Bot efficiency"
    },
  ];

  return (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
      {cards.map((card, index) => (
        <Card key={index} padding="400">
          <BlockStack gap="200">
            <Box>
              <InlineStack align="space-between">
                <Text variant="bodySm" tone="subdued" fontWeight="medium">
                  {card.title}
                </Text>
                <Icon source={card.icon} tone={card.tone} />
              </InlineStack>
            </Box>
            <Box>
              <Text variant="headingLg" as="p">
                {card.value}
              </Text>
            </Box>
            <Box>
              <Text variant="bodyXs" tone="subdued">
                {card.label}
              </Text>
            </Box>
          </BlockStack>
        </Card>
      ))}
    </InlineGrid>
  );
}
