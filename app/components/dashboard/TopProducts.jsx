import { 
  Card, 
  Text, 
  BlockStack, 
  IndexTable,
  EmptySearchResult,
  Box
} from "@shopify/polaris";

export function TopProducts({ products }) {
  const resourceName = {
    singular: 'product',
    plural: 'products',
  };

  const rowMarkup = products?.map(
    ({ product_title, negotiations_count, sales_count, revenue }, index) => (
      <IndexTable.Row id={index} key={index} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {product_title}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{negotiations_count}</IndexTable.Cell>
        <IndexTable.Cell>{sales_count}</IndexTable.Cell>
        <IndexTable.Cell>
          {Number(revenue).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Card padding="0">
      <BlockStack gap="400">
        <Box padding="400">
           <Text variant="headingMd" as="h2">Top Products by Revenue</Text>
        </Box>
        <IndexTable
          resourceName={resourceName}
          itemCount={products?.length || 0}
          headings={[
            { title: 'Product' },
            { title: 'Negotiations' },
            { title: 'Sales' },
            { title: 'Revenue' },
          ]}
          selectable={false}
          emptyState={
            <EmptySearchResult
              title={'No data found'}
              description={'Try changing the filter period.'}
              withIllustration
            />
          }
        >
          {rowMarkup}
        </IndexTable>
      </BlockStack>
    </Card>
  );
}
