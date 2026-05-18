import React, { useRef, useEffect } from 'react';

export const OutpaintPreview = ({ originalImage, outpaintPos, outpaintScale, targetAspectRatio }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !originalImage) return;
    const canvas = canvasRef.current;
    
    const getSpreadRatio = (ratio: string) => {
        if (ratio === '9:16') return '4:3';
        if (ratio === '1:1') return '16:9';
        if (ratio === '4:3') return '16:9';
        if (ratio === '16:9') return '16:9';
        return '16:9';
    };

    const finalRatio = getSpreadRatio(targetAspectRatio);
    const [wStr, hStr] = finalRatio.split(':');
    const ratioW = parseInt(wStr) || 16;
    const ratioH = parseInt(hStr) || 9;
    
    // Use a smaller dimension for preview to save memory and processing
    let cw = 800;
    let ch = 800;
    if (ratioW > ratioH) {
       ch = Math.round(cw * (ratioH / ratioW));
    } else {
       cw = Math.round(ch * (ratioW / ratioH));
    }
    canvas.width = cw;
    canvas.height = ch;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    
    // Draw subtle grid on outpaint area to show it will be AI-filled
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)'; // indigo faint
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let x = 0; x < cw; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke();
    }
    for (let y = 0; y < ch; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
    }

    const img = new Image();
    img.onload = () => {
        const imgRatio = (img.width || 1) / (img.height || 1);
        
        let drawW = cw * outpaintScale;
        let drawH = drawW / imgRatio;
        if (drawH > ch * outpaintScale) {
            drawH = ch * outpaintScale;
            drawW = drawH * imgRatio;
        }
        
        let dx = (cw - drawW) / 2;
        let dy = (ch - drawH) / 2;

        if (outpaintPos === 'left') {
           dx = 0;
        } else if (outpaintPos === 'right') {
           dx = cw - drawW;
        }
        
        // Add subtle shadow behind the original image to make it pop
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 15;
        
        ctx.drawImage(img, dx, dy, drawW, drawH);
        
        // Draw border around the original image
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#indigo-500';
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, drawW, drawH);
    };
    img.src = originalImage;
    
  }, [originalImage, outpaintPos, outpaintScale, targetAspectRatio]);

  return (
    <div className="w-full h-full flex flex-col justify-center items-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[3rem] p-6 relative overflow-hidden">
      <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-white shadow-sm border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-indigo-600 z-10">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
        Live Preview
      </div>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'contain' }} 
        className="rounded-xl shadow-xl border border-slate-300"
      />
      <p className="mt-6 text-sm font-bold text-slate-400 text-center uppercase tracking-widest leading-relaxed">
        The checkered background will be filled by AI<br/>to match the prompt and style.
      </p>
    </div>
  );
};
