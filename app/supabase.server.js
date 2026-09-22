import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in your .env file');
}

// Singleton helper for Supabase access on the server
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default supabase;
