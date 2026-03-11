import { Card, Text, BlockStack, InlineStack, Box, Badge } from "@shopify/polaris";

export function BotPerformance({ performance }) {
  const metrics = [
    {
      label: "Average Rounds",
      value: performance?.avg_rounds_to_convert ?? 0,
      suffix: "rounds",
      helpText: "Average exchange before conversion",
      tone: "info"
    },
    {
      label: "Abandonment Rate",
      value: performance?.abandonment_rate ?? 0,
      suffix: "%",
      helpText: "Chats that did not lead to interest",
      tone: performance?.abandonment_rate > 50 ? "critical" : "attention"
    }
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">AI Performance</Text>
        <InlineStack gap="400">
          {metrics.map((item, index) => (
            <Box key={index} padding="400" background="bg-surface-secondary" borderRadius="200" minWidth="200px">
              <BlockStack gap="100">
                <Text variant="bodySm" tone="subdued">{item.label}</Text>
                <InlineStack gap="100" align="baseline">
                  <Text variant="headingLg" as="p">{item.value}</Text>
                  <Text variant="bodySm" tone="subdued">{item.suffix}</Text>
                </InlineStack>
                <Badge tone={item.tone}>{item.helpText}</Badge>
              </BlockStack>
            </Box>
          ))}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
