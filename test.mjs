import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://npkkeoghzbciiwiouuep.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wa2tlb2doemJjaWl3aW91dWVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzI4NSwiZXhwIjoyMDg4MTgzMjg1fQ.edaSjE3GrYCnvnyUOJPQcY-ALPHwWEpZ9_QtpBAJ5-E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    const shop = "primestore-development.myshopify.com";

    const { data: shopRecord } = await supabase
        .from('shops')
        .select('id')
        .eq('shop_domain', shop)
        .single();

    console.log("Shop Record:", shopRecord);

    if (!shopRecord) {
        console.error("Shop not found");
        return;
    }

    const { data, error } = await supabase
        .from('chat_interactions')
        .insert([{
            store_id: shopRecord.id, // Usually a UUID
            chat_id: '11295f8c-f1a5-4778-a922-87cb40781c3d',
            product_id: 10596338958641, // as Number
            sender: 'bot',
            content: 'hello',
            metadata: { round: 1, offer_value: 300 }
        }]);

    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Success:", data);
    }
}

testInsert();
