import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://npkkeoghzbciiwiouuep.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wa2tlb2doemJjaWl3aW91dWVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzI4NSwiZXhwIjoyMDg4MTgzMjg1fQ.edaSjE3GrYCnvnyUOJPQcY-ALPHwWEpZ9_QtpBAJ5-E';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkTypes() {
  const query = `
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name IN ('leads', 'negotiation_orders', 'chat_interactions', 'shops')
    AND table_schema = 'public'
    ORDER BY table_name, column_name;
  `;

  // We can't run raw SQL via supabase-js unless we have a helper function.
  // Let's try to see if we have one or just use the UI if we were the user.
  // Since I can't run raw SQL, I'll try to guess based on common patterns or try to fetch data and check typeof.
  
  const tables = ['shops', 'leads', 'negotiation_orders', 'chat_interactions'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`Error table ${table}:`, error);
      continue;
    }
    if (data && data.length > 0) {
      console.log(`--- Table: ${table} ---`);
      Object.entries(data[0]).forEach(([key, val]) => {
        console.log(`${key}: ${typeof val} (${val})`);
      });
    }
  }
}

checkTypes();
