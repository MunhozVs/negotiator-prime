import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

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
            shop_id: shopRecord.id, // Fixed: should be shop_id
            chat_id: '11295f8c-f1a5-4778-a922-87cb40781c3d',
            product_id: 10596338958641, // as Number
            sender: 'user',
            content: 'hello',
            current_round: 1,
            current_price: 300,
            metadata: { round: 1, offer_value: 300 }
        }]);

    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Success:", data);
    }
}

testInsert();
