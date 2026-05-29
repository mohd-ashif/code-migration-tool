import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { logger } from "../utils/logger";

export const supabase: SupabaseClient | null =
  config.SUPABASE_URL && config.SUPABASE_KEY ? createClient(config.SUPABASE_URL, config.SUPABASE_KEY) : null;

if (supabase) {
  logger.info("Supabase client configured.");
} else {
  logger.info("Supabase is not configured. SUPABASE_URL and SUPABASE_KEY are required.");
}
