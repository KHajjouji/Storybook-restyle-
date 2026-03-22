
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

export type ExportFormat = 'KDP_5x8' | 'KDP_5_06x7_81' | 'KDP_5_25x8' | 'KDP_5_5x8_5' | 'KDP_6x9' | 'KDP_6_14x9_21' | 'KDP_6_69x9_61' | 'KDP_7x10' | 'KDP_7_44x9_69' | 'KDP_7_5x9_25' | 'KDP_8x10' | 'KDP_8_25x6' | 'KDP_8_25x8_25' | 'KDP_8_5x8_5' | 'KDP_8_5x11' | 'KDP_8_27x11_69' | 'LULU_A4' | 'LULU_US_LETTER' | 'INGRAM_PREMIUM';
export type SpreadExportMode = 'SPLIT_PAGES' | 'WIDE_SPREAD';
export type AppMode = 'restyle' | 'create' | 'upscale' | 'prompt-pack' | 'production-layout' | 'activity-builder' | 'retarget' | 'niche-research';

export interface SeriesPreset {
  id: string;
  title: string;
  description: string;
  masterBible: string;
  characters: { name: string, description: string }[];
  scenes: { id: string, text: string, prompt: string, isSpread: boolean }[];
}

export interface UserStyle {
  id: string;
  name: string;
  image: string;
  prompt: string;
  createdAt: number;
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
  overlayText: boolean;
  showSafeGuides: boolean;
  estimatedPageCount: number;
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  settings: AppSettings;
  pages: BookPage[];
  thumbnail?: string;
  currentStep?: string;
  fullScript?: string;
  activityScript?: string;
  nicheTopic?: string;
  nicheResult?: string;
  coverImage?: string | null;
  coverLayers?: BookLayer[];
  projectContext?: string;
  enableActivityDesigner?: boolean;
  globalFixPrompt?: string;
  targetAspectRatio?: '1:1' | '4:3' | '16:9' | '9:16';
  targetResolution?: '1K' | '2K' | '4K';
}

export const PRINT_FORMATS: Record<ExportFormat, { name: string, width: number, height: number, bleed: number, baseGutter: number, outside: number, top: number, bottom: number }> = {
  KDP_5x8: { name: 'KDP 5" x 8"', width: 5, height: 8, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_5_06x7_81: { name: 'KDP 5.06" x 7.81"', width: 5.06, height: 7.81, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_5_25x8: { name: 'KDP 5.25" x 8"', width: 5.25, height: 8, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_5_5x8_5: { name: 'KDP 5.5" x 8.5"', width: 5.5, height: 8.5, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_6x9: { name: 'KDP 6" x 9"', width: 6, height: 9, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_6_14x9_21: { name: 'KDP 6.14" x 9.21"', width: 6.14, height: 9.21, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_6_69x9_61: { name: 'KDP 6.69" x 9.61"', width: 6.69, height: 9.61, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_7x10: { name: 'KDP 7" x 10"', width: 7, height: 10, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_7_44x9_69: { name: 'KDP 7.44" x 9.69"', width: 7.44, height: 9.69, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_7_5x9_25: { name: 'KDP 7.5" x 9.25"', width: 7.5, height: 9.25, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_8x10: { name: 'KDP 8" x 10"', width: 8, height: 10, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_8_25x6: { name: 'KDP 8.25" x 6"', width: 8.25, height: 6, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_8_25x8_25: { name: 'KDP 8.25" x 8.25"', width: 8.25, height: 8.25, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_8_5x8_5: { name: 'KDP 8.5" x 8.5"', width: 8.5, height: 8.5, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_8_5x11: { name: 'KDP 8.5" x 11"', width: 8.5, height: 11, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  KDP_8_27x11_69: { name: 'KDP 8.27" x 11.69"', width: 8.27, height: 11.69, bleed: 0.125, baseGutter: 0.375, outside: 0.375, top: 0.375, bottom: 0.375 },
  LULU_A4: { name: 'Lulu A4 (8.27" x 11.69")', width: 8.27, height: 11.69, bleed: 0.125, baseGutter: 0.5, outside: 0.375, top: 0.375, bottom: 0.375 },
  LULU_US_LETTER: { name: 'Lulu Letter (8.5" x 11")', width: 8.5, height: 11, bleed: 0.125, baseGutter: 0.5, outside: 0.375, top: 0.375, bottom: 0.375 },
  INGRAM_PREMIUM: { name: 'IngramSpark Standard (7" x 10")', width: 7, height: 10, bleed: 0.125, baseGutter: 0.5, outside: 0.5, top: 0.5, bottom: 0.5 },
};
