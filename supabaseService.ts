import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project } from './types';

export interface DatabaseConfig {
  provider: 'supabase' | 'firebase' | 'none';
  url?: string;
  key?: string;
}

const getStoredConfig = (): DatabaseConfig | null => {
  const stored = localStorage.getItem('storyflow_db_config');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return null;
    }
  }
  return null;
};

const config = getStoredConfig();

// These should be set in your environment variables
const SUPABASE_URL = (process.env as any).SUPABASE_URL || config?.url;
const SUPABASE_ANON_KEY = (process.env as any).SUPABASE_ANON_KEY || config?.key;

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Only initialize if keys are present
export let supabase: SupabaseClient | null = isSupabaseConfigured 
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!) 
  : null;

export const supabaseService = {
  async testConnection(url: string, key: string): Promise<boolean> {
    try {
      const tempClient = createClient(url, key);
      const { error } = await tempClient.from('projects').select('id').limit(1);
      // If error is 404 (table not found), it's still "connected" to Supabase, 
      // but if it's 401/403 or network error, it's failed.
      if (error && error.code !== 'PGRST116' && error.status !== 404) {
        console.error("Connection test error:", error);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  async saveConfig(url: string, key: string) {
    localStorage.setItem('storyflow_db_config', JSON.stringify({
      provider: 'supabase',
      url,
      key
    }));
    supabase = createClient(url, key);
    window.location.reload(); // Reload to re-initialize all services with new client
  },

  async saveProject(project: Project, userId: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('projects')
      .upsert({
        id: project.id,
        user_id: userId,
        name: project.name,
        settings: project.settings,
        pages: project.pages,
        thumbnail: project.thumbnail,
        last_modified: new Date(project.lastModified).toISOString()
      });

    if (error) throw error;
  },

  async getProjects(userId: string): Promise<Project[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('last_modified', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      settings: row.settings,
      pages: row.pages,
      thumbnail: row.thumbnail,
      lastModified: new Date(row.last_modified).getTime()
    }));
  },

  async deleteProject(id: string): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};