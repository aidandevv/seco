import { loadConfig } from '../../config/keys.js';
import type { Experience, ApplicationSnapshot } from '../../experience/types.js';

let _supabase: unknown = null;

async function getSupabaseClient(): Promise<{
  from: (table: string) => { upsert: (data: unknown) => Promise<{ error: unknown }> };
} | null> {
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;

  if (_supabase) return _supabase as ReturnType<typeof getSupabaseClient> extends Promise<infer T> ? T : never;

  try {
    // @ts-expect-error supabase-js is an optional peer dependency
    const { createClient } = (await import('@supabase/supabase-js')) as {
      createClient: (url: string, key: string) => {
        from: (table: string) => { upsert: (data: unknown) => Promise<{ error: unknown }> };
      };
    };
    _supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    return _supabase as ReturnType<typeof getSupabaseClient> extends Promise<infer T> ? T : never;
  } catch {
    return null;
  }
}

export async function syncExperience(experience: Experience): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client.from('experiences').upsert(experience);
    if (error) console.warn('[seco] Supabase sync warning:', error);
  } catch (e) {
    console.warn('[seco] Supabase sync failed (local data unaffected):', e);
  }
}

export async function syncSnapshot(snapshot: ApplicationSnapshot): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) return;

  try {
    const { error } = await client.from('application_snapshots').upsert({
      ...snapshot,
      jd_parsed: JSON.stringify(snapshot.jd_parsed),
      experience_ids: JSON.stringify(snapshot.experience_ids),
      rendered_outputs: JSON.stringify(snapshot.rendered_outputs),
      gap_analysis: JSON.stringify(snapshot.gap_analysis),
    });
    if (error) console.warn('[seco] Supabase snapshot sync warning:', error);
  } catch (e) {
    console.warn('[seco] Supabase snapshot sync failed (local data unaffected):', e);
  }
}
