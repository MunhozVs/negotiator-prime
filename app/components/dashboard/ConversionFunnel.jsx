import { Card, Text, BlockStack, Box } from "@shopify/polaris";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

export function ConversionFunnel({ metrics }) {
  const data = [
    { name: "Chats", value: metrics?.total_chats_started ?? 0, color: "#95a5a6" },
    { name: "Leads", value: metrics?.leads_captured ?? 0, color: "#3498db" },
    { name: "Drafts", value: metrics?.orders_drafted ?? 0, color: "#f1c40f" },
    { name: "Paid", value: metrics?.orders_paid ?? 0, color: "#2ecc71" },
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#fff', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{payload[0].payload.name}</p>
          <p style={{ margin: 0, color: payload[0].payload.color }}>
            Value: {payload[0].value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">Conversion Funnel</Text>
        <Box style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="#637381"
                fontSize={12}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={40}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </BlockStack>
    </Card>
  );
}
