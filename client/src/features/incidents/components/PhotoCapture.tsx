import React, { useRef, useState } from 'react';

interface PhotoCaptureProps {
  initialPhotoUrl?: string | null;
  onPhotoCaptured: (imageDataUrl: string, fileSize?: number, mimeType?: string) => void;
  onPhotoCleared: () => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  initialPhotoUrl = null,
  onPhotoCaptured,
  onPhotoCleared
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPhotoUrl);
  const [fileDetails, setFileDetails] = useState<{ sizeKb?: number; mimeType?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setPreviewUrl(initialPhotoUrl);
  }, [initialPhotoUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate MIME type
    if (!file.type || !file.type.startsWith('image/')) {
      setError('Invalid file type: Camera or photo evidence must be a valid image format (JPEG, PNG, WebP).');
      return;
    }

    // Validate size (max 5MB)
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setError('Image file is too large. Maximum allowed evidence size is 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setError('Camera access error or failed to read captured image.');
    };
    reader.onload = event => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setPreviewUrl(dataUrl);
        const kb = Math.round(file.size / 1024);
        setFileDetails({ sizeKb: kb, mimeType: file.type });
        onPhotoCaptured(dataUrl, file.size, file.type);
      } else {
        setError('Unable to process captured photograph. Please try again.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setFileDetails(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onPhotoCleared();
  };

  const handleTriggerCapture = () => {
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <div className="p-3 bg-rose-950/90 border border-rose-700/80 rounded-xl text-xs text-rose-200 font-semibold flex items-start gap-2 shadow">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {previewUrl ? (
        <div className="flex flex-col gap-3">
          <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-xl bg-slate-950">
            <img
              src={previewUrl}
              alt="Captured Incident Evidence"
              className="w-full max-h-64 object-cover"
            />
            <div className="absolute top-2 right-2 bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full shadow">
              ✓ Evidence Captured
            </div>
            {fileDetails && (
              <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-slate-300 text-[10px] font-mono px-2 py-0.5 rounded-md">
                {fileDetails.sizeKb} KB • {fileDetails.mimeType}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRetake}
            className="w-full py-3 px-4 rounded-xl font-bold bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 text-xs transition-all flex items-center justify-center gap-2 shadow"
          >
            <span>🔄</span>
            <span>Retake / Replace Photo</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleTriggerCapture}
          className="w-full py-8 border-2 border-dashed border-amber-500/40 hover:border-amber-400 bg-amber-950/20 hover:bg-amber-950/40 rounded-2xl flex flex-col items-center justify-center gap-2 text-amber-300 transition-all active:scale-[0.99] shadow-lg"
        >
          <div className="w-12 h-12 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-2xl font-bold shadow-md">
            📷
          </div>
          <span className="font-extrabold text-sm text-white mt-1">Capture Field Photograph</span>
          <span className="text-xs opacity-75 font-medium">Tap to open device camera or select photo</span>
        </button>
      )}
    </div>
  );
};
