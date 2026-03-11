import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

export function RevenueChart({ data }) {
  // If no data, show empty state or zeros
  const chartData = (data && data.length > 0) ? data.map(item => ({
    ...item,
    formattedDate: new Date(item.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
    revenue: Number(item.revenue),
    orders: Number(item.orders)
  })) : [];

  const formatCurrency = (value) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">Revenue vs. Orders</Text>
        <Box style={{ height: '350px' }}>
          {chartData.length === 0 ? (
            <Box padding="1000" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Text tone="subdued">No data for the selected period</Text>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="formattedDate" 
                  stroke="#637381" 
                  fontSize={12} 
                />
                <YAxis 
                  yAxisId="left" 
                  stroke="#637381" 
                  fontSize={12}
                  tickFormatter={(val) => `$${val}`}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right" 
                  stroke="#637381" 
                  fontSize={12} 
                />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'revenue' ? formatCurrency(value) : value,
                    name === 'revenue' ? 'Revenue' : 'Orders'
                  ]}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#008060"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name="revenue"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="orders"
                  stroke="#108043"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  name="orders"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Box>
      </BlockStack>
    </Card>
  );
}
