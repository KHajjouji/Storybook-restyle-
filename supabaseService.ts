import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project } from './types';

// These should be set in your environment variables
const SUPABASE_URL = (process.env as any).SUPABASE_URL;
const SUPABASE_ANON_KEY = (process.env as any).SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Only initialize if keys are present to avoid "supabaseUrl is required" error
export const supabase: SupabaseClient | null = isSupabaseConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

export const supabaseService = {
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