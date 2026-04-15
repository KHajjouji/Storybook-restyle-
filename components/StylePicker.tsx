import React, { useRef } from 'react';
import { Upload, Check } from 'lucide-react';
import { PREDEFINED_STYLES } from '../seriesData';

// Friendly display names and descriptions (no technical prompt text shown)
const STYLE_META: { name: string; description: string }[] = [
  {
    name: 'Soft Pastel',
    description: 'Warm, gentle colours with a dreamy, cozy feel — perfect for bedtime stories.',
  },
  {
    name: 'Watercolour',
    description: 'Delicate brushstrokes and translucent hues, like a hand-painted picture book.',
  },
  {
    name: 'Bold & Bright',
    description: 'Vibrant flat colours and clean lines — modern, fun, and easy to read.',
  },
  {
    name: '3D Storybook',
    description: 'Rich 3D characters with cinematic lighting, like a Pixar movie.',
  },
];

interface StylePickerProps {
  selectedIndex: number | null;
  customStyleImage?: string;
  onSelect: (index: number) => void;
  onCustomStyleUpload: (base64: string) => void;
}

export const StylePicker: React.FC<StylePickerProps> = ({
  selectedIndex,
  customStyleImage,
  onSelect,
  onCustomStyleUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCustomStyleUpload(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <p className="text-slate-500 text-center font-medium">
        Choose the illustration style for your book. You can always change it later.
      </p>

      {/* Predefined styles grid */}
      <div className="grid grid-cols-2 gap-5">
        {PREDEFINED_STYLES.map((style, idx) => {
          const meta = STYLE_META[idx];
          const isSelected = selectedIndex === idx;

          return (
            <button
              key={style.id}
              onClick={() => onSelect(idx)}
              className={`relative group rounded-[2rem] overflow-hidden border-4 transition-all text-left shadow-sm hover:shadow-xl ${
                isSelected
                  ? 'border-indigo-600 shadow-indigo-200 shadow-xl scale-[1.02]'
                  : 'border-transparent hover:border-indigo-200'
              }`}
            >
              {/* Thumbnail */}
              <div className="aspect-square bg-slate-100 overflow-hidden">
                <img
                  src={style.image}
                  alt={meta.name}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
              </div>

              {/* Label */}
              <div className="p-4 bg-white">
                <h4 className="font-black text-slate-900 text-lg">{meta.name}</h4>
                <p className="text-slate-500 text-sm font-medium mt-1 leading-snug">{meta.description}</p>
              </div>

              {/* Selected checkmark */}
              {isSelected && (
                <div className="absolute top-3 right-3 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg">
                  <Check size={16} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Custom style upload */}
      <div className="mt-4">
        <p className="text-center text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
          Or upload a picture with a style you love
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`w-full rounded-[2rem] border-4 border-dashed transition-all p-6 flex flex-col items-center gap-3 ${
            customStyleImage
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-slate-200 hover:border-indigo-300 bg-slate-50 hover:bg-indigo-50'
          }`}
        >
          {customStyleImage ? (
            <div className="flex items-center gap-4">
              <img
                src={customStyleImage}
                alt="Custom style"
                className="w-16 h-16 rounded-xl object-cover shadow"
              />
              <div className="text-left">
                <p className="font-black text-indigo-600">Custom style uploaded!</p>
                <p className="text-slate-500 text-sm">Click to change</p>
              </div>
              <div className="ml-auto w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <Check size={16} className="text-white" />
              </div>
            </div>
          ) : (
            <>
              <Upload size={32} className="text-slate-400" />
              <p className="font-bold text-slate-500">Upload a reference image</p>
              <p className="text-slate-400 text-sm">JPG, PNG — We'll match its style</p>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};
