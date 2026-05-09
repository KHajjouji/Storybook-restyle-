export const GOOGLE_FONTS = [
  { name: 'Inter', family: 'Inter', category: 'sans-serif' },
  { name: 'Nunito', family: 'Nunito', category: 'sans-serif' },
  { name: 'Fredoka', family: 'Fredoka', category: 'sans-serif' },
  { name: 'Quicksand', family: 'Quicksand', category: 'sans-serif' },
  { name: 'Outfit', family: 'Outfit', category: 'sans-serif' },
  { name: 'Noto Sans', family: 'Noto Sans', category: 'sans-serif' },
  { name: 'Lexend', family: 'Lexend', category: 'sans-serif' },
  { name: 'Comic Neue', family: 'Comic Neue', category: 'cursive' },
  { name: 'Patrick Hand', family: 'Patrick Hand', category: 'cursive' },
  { name: 'Chewy', family: 'Chewy', category: 'cursive' },
  { name: 'Bangers', family: 'Bangers', category: 'display' },
  { name: 'Amatic SC', family: 'Amatic SC', category: 'display' },
  { name: 'Cinzel', family: 'Cinzel', category: 'serif' },
  { name: 'Lora', family: 'Lora', category: 'serif' },
  { name: 'Georgia', family: 'Georgia', category: 'serif', system: true },
  { name: 'Courier New', family: 'Courier New', category: 'monospace', system: true },
];

export const STORY_TYPES = [
  { id: 'picture-book', name: "Children's Picture Book", defaultFont: 'Nunito' },
  { id: 'activity-book', name: "Activity Book", defaultFont: 'Fredoka' },
  { id: 'educational', name: "Educational / STEM", defaultFont: 'Quicksand' },
  { id: 'fantasy', name: "Fantasy", defaultFont: 'Cinzel' },
  { id: 'adventure', name: "Adventure", defaultFont: 'Bangers' },
  { id: 'religious', name: "Religious / Spiritual", defaultFont: 'Lora' },
  { id: 'bilingual', name: "Bilingual / Inclusive", defaultFont: 'Noto Sans' }
];

export const loadGoogleFont = async (fontFamily: string) => {
  const fontObj = GOOGLE_FONTS.find(f => f.name === fontFamily || f.family === fontFamily);
  if (!fontObj || fontObj.system) return;

  const fontId = `font-${fontFamily.replace(/\s+/g, '-')}`;
  if (document.getElementById(fontId)) {
    await document.fonts.ready;
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@400;500;600;700;800&display=swap`;
    
    link.onload = async () => {
      await document.fonts.ready;
      resolve();
    };
    link.onerror = () => reject(new Error(`Failed to load font ${fontFamily}`));
    
    document.head.appendChild(link);
  });
};
