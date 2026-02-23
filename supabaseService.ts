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

// Load from environment or runtime storage
const SUPABASE_URL = (process.env as any).SUPABASE_URL || config?.url;
const SUPABASE_ANON_KEY = (process.env as any).SUPABASE_ANON_KEY || config?.key;

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Initialize client only if configured
export let supabase: SupabaseClient | null = isSupabaseConfigured 
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!) 
  : null;

export const supabaseService = {
  /**
   * Tests a connection to a specific Supabase instance.
   */
  async testConnection(url: string, key: string): Promise<{success: boolean, message: string}> {
    try {
      const tempClient = createClient(url, key);
      // Attempt to ping the auth or a specific table
      const { error } = await tempClient.from('projects').select('id').limit(1);
      
      if (error) {
        // Use code instead of status as PostgrestError doesn't have status
        if (error.code === 'PGRST116' || error.code === '42P01') {
          return { success: true, message: "Connected! Warning: 'projects' table not found, but DB is reachable." };
        }
        return { success: false, message: error.message };
      }
      return { success: true, message: "Handshake successful. Table 'projects' found." };
    } catch (e: any) {
      return { success: false, message: e.message || "Connection failed" };
    }
  },

  /**
   * Saves credentials to local storage and reloads for immediate effect.
   */
  async saveConfig(url: string, key: string) {
    localStorage.setItem('storyflow_db_config', JSON.stringify({
      provider: 'supabase',
      url,
      key
    }));
    window.location.reload(); 
  },

  /**
   * Standard project persistence methods
   */
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