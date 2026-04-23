import React, { useRef, useState } from 'react';
import { Upload, Check, AlertCircle } from 'lucide-react';
import { PREDEFINED_STYLES } from '../seriesData';

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
  customStylePrompt?: string;
  onSelect: (index: number) => void;
  onCustomStyleUpload: (base64: string) => void;
}

export const StylePicker: React.FC<StylePickerProps> = ({
  selectedIndex,
  customStyleImage,
  customStylePrompt,
  onSelect,
  onCustomStyleUpload,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const processFile = (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image too large — please use an image under 10 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onCustomStyleUpload(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const analysisComplete = !!customStyleImage && !!customStylePrompt;

  const uploadZoneClass = [
    'w-full rounded-[2rem] border-4 border-dashed transition-all p-6 flex flex-col items-center gap-3',
    isDragging
      ? 'border-indigo-500 bg-indigo-100'
      : analysisComplete
      ? 'border-emerald-400 bg-emerald-50'
      : customStyleImage
      ? 'border-indigo-400 bg-indigo-50'
      : 'border-slate-200 hover:border-indigo-300 bg-slate-50 hover:bg-indigo-50',
  ].join(' ');

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
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={uploadZoneClass}
        >
          {customStyleImage ? (
            <div className="flex items-center gap-4 w-full">
              <img
                src={customStyleImage}
                alt="Custom style"
                className="w-16 h-16 rounded-xl object-cover shadow flex-shrink-0"
              />
              <div className="text-left flex-1 min-w-0">
                {analysisComplete ? (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-white" />
                    </div>
                    <p className="font-black text-emerald-700">Style ready!</p>
                  </div>
                ) : (
                  <p className="font-black text-indigo-600 mb-1">Analysing style…</p>
                )}
                <p className="text-slate-500 text-sm">Click to upload a different image</p>
              </div>
            </div>
          ) : (
            <>
              <Upload size={32} className={isDragging ? 'text-indigo-500' : 'text-slate-400'} />
              <p className="font-bold text-slate-500">Upload a reference image</p>
              <p className="text-slate-400 text-sm">JPG, PNG — or drag &amp; drop here</p>
            </>
          )}
        </button>
        {uploadError && (
          <div className="flex items-center gap-2 mt-2 text-red-500 text-xs font-medium justify-center">
            <AlertCircle size={14} />
            {uploadError}
          </div>
        )}
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
