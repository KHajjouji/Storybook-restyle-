
// Re-export from types.ts so consumers only need one import
export type { StoryType } from '../types';

export interface FontRecommendation {
  family: string;
  weight: string;
  googleFontsParams: string; // e.g. "Nunito:wght@700;800"
  fallback: string;
  fontSize: number; // in pt (at 72 dpi)
  lineHeightMultiplier: number;
  description: string;
}

export const STORY_FONT_RECOMMENDATIONS: Record<StoryType, FontRecommendation> = {
  children_picture_book: {
    family: 'Nunito',
    weight: '700',
    googleFontsParams: 'Nunito:wght@700;800',
    fallback: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 26,
    lineHeightMultiplier: 1.55,
    description: 'Warm, rounded, child-friendly',
  },
  activity_book: {
    family: 'Fredoka One',
    weight: '400',
    googleFontsParams: 'Fredoka+One',
    fallback: 'Impact, sans-serif',
    fontSize: 24,
    lineHeightMultiplier: 1.4,
    description: 'Bold, playful, engaging for activities',
  },
  educational: {
    family: 'Quicksand',
    weight: '700',
    googleFontsParams: 'Quicksand:wght@600;700',
    fallback: 'Verdana, sans-serif',
    fontSize: 22,
    lineHeightMultiplier: 1.6,
    description: 'Clean, modern, highly readable',
  },
  fantasy: {
    family: 'Cinzel',
    weight: '700',
    googleFontsParams: 'Cinzel:wght@700',
    fallback: 'Palatino Linotype, Georgia, serif',
    fontSize: 22,
    lineHeightMultiplier: 1.5,
    description: 'Elegant, classical, magical',
  },
  adventure: {
    family: 'Bangers',
    weight: '400',
    googleFontsParams: 'Bangers',
    fallback: 'Impact, sans-serif',
    fontSize: 28,
    lineHeightMultiplier: 1.35,
    description: 'Dynamic, bold, comic-style',
  },
  religious_spiritual: {
    family: 'Lora',
    weight: '600',
    googleFontsParams: 'Lora:wght@600;700',
    fallback: 'Georgia, Times New Roman, serif',
    fontSize: 22,
    lineHeightMultiplier: 1.65,
    description: 'Dignified, warm, reverent',
  },
  bilingual: {
    family: 'Noto Sans',
    weight: '600',
    googleFontsParams: 'Noto+Sans:wght@600;700',
    fallback: 'Arial, sans-serif',
    fontSize: 20,
    lineHeightMultiplier: 1.55,
    description: 'Universal multi-script support',
  },
};

// Additional curated Google Fonts available for manual selection
export const CURATED_GOOGLE_FONTS: { family: string; weight: string; googleFontsParams: string; label: string }[] = [
  { family: 'Nunito', weight: '700', googleFontsParams: 'Nunito:wght@700;800', label: 'Nunito (Soft & Rounded)' },
  { family: 'Fredoka One', weight: '400', googleFontsParams: 'Fredoka+One', label: 'Fredoka One (Playful Bold)' },
  { family: 'Quicksand', weight: '700', googleFontsParams: 'Quicksand:wght@600;700', label: 'Quicksand (Clean Modern)' },
  { family: 'Baloo 2', weight: '700', googleFontsParams: 'Baloo+2:wght@600;700;800', label: 'Baloo 2 (Cheerful)' },
  { family: 'Patrick Hand', weight: '400', googleFontsParams: 'Patrick+Hand', label: 'Patrick Hand (Handwritten)' },
  { family: 'Chewy', weight: '400', googleFontsParams: 'Chewy', label: 'Chewy (Chunky Playful)' },
  { family: 'Bangers', weight: '400', googleFontsParams: 'Bangers', label: 'Bangers (Comic Adventure)' },
  { family: 'Cinzel', weight: '700', googleFontsParams: 'Cinzel:wght@700', label: 'Cinzel (Fantasy Elegant)' },
  { family: 'Lora', weight: '600', googleFontsParams: 'Lora:wght@600;700', label: 'Lora (Warm Serif)' },
  { family: 'Noto Sans', weight: '600', googleFontsParams: 'Noto+Sans:wght@600;700', label: 'Noto Sans (Universal)' },
  { family: 'Outfit', weight: '700', googleFontsParams: 'Outfit:wght@600;700', label: 'Outfit (Contemporary)' },
  { family: 'Amatic SC', weight: '700', googleFontsParams: 'Amatic+SC:wght@700', label: 'Amatic SC (Quirky Tall)' },
  { family: 'Comic Neue', weight: '700', googleFontsParams: 'Comic+Neue:wght@700', label: 'Comic Neue (Friendly)' },
  { family: 'Poppins', weight: '700', googleFontsParams: 'Poppins:wght@600;700', label: 'Poppins (Geometric)' },
  { family: 'Inter', weight: '700', googleFontsParams: 'Inter:wght@600;700', label: 'Inter (Professional)' },
];

// Track which fonts have been loaded to avoid duplicate injections
const loadedFontKeys = new Set<string>();

/**
 * Loads a Google Font dynamically via CSS injection and waits for it to be
 * available in the browser's FontFaceSet (required for canvas rendering).
 */
export const loadGoogleFont = async (fontFamily: string, googleFontsParams: string, weight: string = '700'): Promise<boolean> => {
  if (typeof document === 'undefined') return false;

  const fontKey = `${fontFamily}-${weight}`;
  if (loadedFontKeys.has(fontKey)) return true;

  const encodedId = `gfont-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;

  try {
    if (!document.getElementById(encodedId)) {
      const link = document.createElement('link');
      link.id = encodedId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${googleFontsParams}&display=swap`;
      document.head.appendChild(link);

      await new Promise<void>((resolve) => {
        link.onload = () => resolve();
        link.onerror = () => resolve();
        setTimeout(resolve, 2500); // fallback timeout
      });
    }

    // Ensure the font is ready for canvas use
    await document.fonts.load(`${weight} 24px "${fontFamily}"`);
    loadedFontKeys.add(fontKey);
    return true;
  } catch (e) {
    console.warn(`[fontLoader] Failed to load "${fontFamily}":`, e);
    return false;
  }
};

export const getFontRecommendation = (storyType: StoryType): FontRecommendation => {
  return STORY_FONT_RECOMMENDATIONS[storyType] ?? STORY_FONT_RECOMMENDATIONS.children_picture_book;
};

/** Returns the googleFontsParams string for a given font family from the curated list. */
export const getGoogleFontsParams = (fontFamily: string, weight: string = '700'): string => {
  const match = CURATED_GOOGLE_FONTS.find(f => f.family === fontFamily);
  if (match) return match.googleFontsParams;
  // Generic fallback: encode the family name and append weight
  return `${fontFamily.replace(/\s+/g, '+')}:wght@${weight}`;
};
