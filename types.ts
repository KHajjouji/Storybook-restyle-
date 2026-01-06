export interface CharacterRef {
  id: string;
  image: string; // base64
  name: string;
  description?: string;
}

export interface CharacterAssignment {
  refId: string;
  description: string;
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
}

export type ExportFormat = 'KDP_SQUARE' | 'KDP_PORTRAIT' | 'LULU_A4' | 'INGRAM_PREMIUM';
export type SpreadExportMode = 'SPLIT_PAGES' | 'WIDE_SPREAD';
export type AppMode = 'restyle' | 'create' | 'upscale' | 'prompt-pack';

export interface AppSettings {
  mode: AppMode;
  fullScript?: string;
  masterBible?: string; // New: For "Prompt Pack" mode
  targetStyle: string;
  styleReference?: string; 
  targetLanguage: string | 'NONE_CLEAN_BG';
  characterReferences: CharacterRef[]; 
  exportFormat: ExportFormat;
  spreadExportMode: SpreadExportMode;
  useProModel: boolean;
  embedTextInImage: boolean;
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
    baseGutter: 0.75,
    outside: 0.5, 
    top: 0.5, 
    bottom: 0.75 
  },
  KDP_PORTRAIT: { 
    name: 'KDP Portrait (6" x 9")', 
    width: 6, 
    height: 9, 
    bleed: 0.125, 
    baseGutter: 0.75, 
    outside: 0.5, 
    top: 0.5, 
    bottom: 0.75 
  },
  LULU_A4: { 
    name: 'Lulu A4 (210 x 297 mm)', 
    width: 8.27, 
    height: 11.69, 
    bleed: 0.118, 
    baseGutter: 0.75, 
    outside: 0.5, 
    top: 0.5, 
    bottom: 0.75 
  },
  INGRAM_PREMIUM: { 
    name: 'IngramSpark Standard (7" x 10")', 
    width: 7, 
    height: 10, 
    bleed: 0.125, 
    baseGutter: 0.75, 
    outside: 0.5, 
    top: 0.5, 
    bottom: 0.75 
  },
};