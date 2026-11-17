import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// own storageKey: this site shares the github.io origin (and localStorage) with other BKK11 apps
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let c: SupabaseClient<any, "public", any> | undefined;
export const sbBrowser = () =>
  (c ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { storageKey: "bkk11-checkin-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  }));
