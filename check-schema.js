import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://npkkeoghzbciiwiouuep.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wa2tlb2doemJjaWl3aW91dWVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzI4NSwiZXhwIjoyMDg4MTgzMjg1fQ.edaSjE3GrYCnvnyUOJPQcY-ALPHwWEpZ9_QtpBAJ5-E';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTable(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);

  if (error) {
    console.error(`Error fetching ${tableName}:`, error);
    return;
  }

  if (data && data.length > 0) {
    console.log(`Columns in ${tableName}:`, Object.keys(data[0]));
    // In JS we can't easily see the DB type, but we can try to guess or use RPC to get schema info
  } else {
    console.log(`No data in ${tableName}.`);
  }
}

async function checkSchema() {
  console.log("Checking tables...");
  await checkTable('shops');
  await checkTable('shop_settings');
  await checkTable('leads');
  await checkTable('negotiation_orders');
  await checkTable('chat_interactions');
}

checkSchema();
