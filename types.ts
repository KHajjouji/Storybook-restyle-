
export interface CharacterRef {
  id: string;
  images: string[]; 
  name: string;
  description?: string;
}

export interface CharacterAssignment {
  refId: string;
  description: string;
}

export interface Hotspot {
  x: number;
  y: number;
  label: number;
}

export interface CharacterRetargeting {
  sourceImage?: string;
  sourceHotspots: Hotspot[];
  targetHotspots: Hotspot[];
  instruction?: string;
}

export interface BookLayer {
  id: string;
  name: string;
  image: string; // base64
  isVisible: boolean;
  type: 'background' | 'character' | 'foreground' | 'text';
}

export interface BookPage {
  id: string;
  originalImage?: string; 
  processedImage?: string; 
  originalText: string;
  translatedText?: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  assignments: CharacterAssignment[];
  isSpread: boolean; 
  overrideStylePrompt?: string; 
  retargeting?: CharacterRetargeting;
  layers?: BookLayer[];
}

export type ExportFormat = 'KDP_SQUARE' | 'KDP_PORTRAIT' | 'LULU_A4' | 'LULU_US_LETTER' | 'INGRAM_PREMIUM';
export type SpreadExportMode = 'SPLIT_PAGES' | 'WIDE_SPREAD';
export type AppMode = 'restyle' | 'create' | 'upscale' | 'prompt-pack' | 'production-layout' | 'activity-builder' | 'retarget';

export interface SeriesPreset {
  id: string;
  title: string;
  description: string;
  masterBible: string;
  characters: { name: string, description: string }[];
  scenes: { id: string, text: string, prompt: string, isSpread: boolean }[];
}

export interface AppSettings {
  mode: AppMode;
  fullScript?: string;
  masterBible?: string; 
  targetStyle: string;
  styleReference?: string; 
  targetLanguage: string | 'NONE_CLEAN_BG';
  characterReferences: CharacterRef[]; 
  exportFormat: ExportFormat;
  spreadExportMode: SpreadExportMode;
  useProModel: boolean;
  embedTextInImage: boolean;
  layeredMode: boolean;
  estimatedPageCount: number;
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  settings: AppSettings;
  pages: BookPage[];
  thumbnail?: string;
}

export const PRINT_FORMATS = {
  KDP_SQUARE: { 
    name: 'KDP Square (8.5" x 8.5")', 
    width: 8.5, 
    height: 8.5, 
    bleed: 0.125, 
    baseGutter: 0.375,
    outside: 0.25, 
    top: 0.25, 
    bottom: 0.25 
  },
  KDP_PORTRAIT: { 
    name: 'KDP Portrait (6" x 9")', 
    width: 6, 
    height: 9, 
    bleed: 0.125, 
    baseGutter: 0.375, 
    outside: 0.25, 
    top: 0.25, 
    bottom: 0.25 
  },
  LULU_A4: { 
    name: 'Lulu A4 (8.27" x 11.69")', 
    width: 8.27, 
    height: 11.69, 
    bleed: 0.125, 
    baseGutter: 0.5, 
    outside: 0.375, 
    top: 0.375, 
    bottom: 0.375 
  },
  LULU_US_LETTER: { 
    name: 'Lulu Letter (8.5" x 11")', 
    width: 8.5, 
    height: 11, 
    bleed: 0.125, 
    baseGutter: 0.5, 
    outside: 0.375, 
    top: 0.375, 
    bottom: 0.375 
  },
  INGRAM_PREMIUM: { 
    name: 'IngramSpark Standard (7" x 10")', 
    width: 7, 
    height: 10, 
    bleed: 0.125, 
    baseGutter: 0.5, 
    outside: 0.5, 
    top: 0.5, 
    bottom: 0.5 
  },
};
