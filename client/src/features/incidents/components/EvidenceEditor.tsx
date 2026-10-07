import React, { useRef, useState } from 'react';
import type { IncidentEvidence } from '../types/incident';
import type { NewEvidencePhoto } from '../utils/incidentEdit';
import { MAX_PHOTOS_PER_INCIDENT, PHOTO_ACCEPT_ATTRIBUTE, readEvidenceFile, type CapturedPhoto } from '../utils/photoFile';
import { FieldHint } from './FieldHint';

interface EvidenceEditorProps {
  existing: IncidentEvidence[];
  removedIds: string[];
  newPhotos: NewEvidencePhoto[];
  onToggleRemove: (evidenceId: string) => void;
  onAddPhoto: (photo: CapturedPhoto) => void;
  onRemoveNewPhoto: (key: string) => void;
  error?: string;
  sectionRef?: (el: HTMLElement | null) => void;
}

export const EvidenceEditor: React.FC<EvidenceEditorProps> = ({
  existing,
  removedIds,
  newPhotos,
  onToggleRemove,
  onAddPhoto,
  onRemoveNewPhoto,
  error,
  sectionRef
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const activeCount = existing.filter(ev => !ev.evidenceId || !removedIds.includes(ev.evidenceId)).length + newPhotos.length;
  const canAdd = activeCount < MAX_PHOTOS_PER_INCIDENT;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    readEvidenceFile(file)
      .then(onAddPhoto)
      .catch(err => setFileError(err instanceof Error ? err.message : 'Unable to process captured photograph. Please try again.'));
  };

  return (
    <div ref={sectionRef} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
          Photographic Evidence <span className="text-rose-400">*</span>
        </label>
        <span className="text-[10px] font-bold text-slate-400">
          {activeCount} of {MAX_PHOTOS_PER_INCIDENT} photos
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={PHOTO_ACCEPT_ATTRIBUTE}
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        data-testid="evidence-file-input"
      />

      {fileError && (
        <div className="p-3 bg-rose-950/90 border border-rose-700/80 rounded-xl text-xs text-rose-200 font-semibold flex items-start gap-2">
          <span>⚠️</span>
          <span>{fileError}</span>
        </div>
      )}

      <div
        className={`grid grid-cols-2 sm:grid-cols-3 gap-2.5 rounded-2xl transition-shadow ${
          error ? 'ring-2 ring-rose-500/60 ring-offset-4 ring-offset-slate-950' : ''
        }`}
      >
        {existing.map((ev, idx) => {
          const id = ev.evidenceId ?? `existing-${idx}`;
          const isRemoved = Boolean(ev.evidenceId && removedIds.includes(ev.evidenceId));
          return (
            <div key={id} className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 aspect-square">
              <img
                src={ev.imageUrl}
                alt={`Evidence photo ${idx + 1}`}
                className={`w-full h-full object-cover transition-opacity ${isRemoved ? 'opacity-25 grayscale' : ''}`}
              />
              {isRemoved && (
                <span className="absolute top-2 left-2 bg-rose-950/90 border border-rose-500/60 text-rose-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  Will be removed
                </span>
              )}
              {ev.evidenceId && (
                <button
                  type="button"
                  onClick={() => onToggleRemove(ev.evidenceId!)}
                  aria-label={isRemoved ? `Undo remove photo ${idx + 1}` : `Remove photo ${idx + 1}`}
                  className={`absolute bottom-2 right-2 py-1 px-2.5 rounded-full text-[10px] font-extrabold border shadow ${
                    isRemoved
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-950/85 text-rose-300 border-rose-500/50 hover:bg-rose-950'
                  }`}
                >
                  {isRemoved ? 'Undo' : 'Remove'}
                </button>
              )}
            </div>
          );
        })}

        {newPhotos.map((photo, idx) => (
          <div key={photo.key} className="relative rounded-2xl overflow-hidden border-2 border-emerald-500/50 bg-slate-950 aspect-square">
            <img src={photo.imageUrl} alt={`New photo ${idx + 1}`} className="w-full h-full object-cover" />
            <span className="absolute top-2 left-2 bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              New
            </span>
            <button
              type="button"
              onClick={() => onRemoveNewPhoto(photo.key)}
              aria-label={`Discard new photo ${idx + 1}`}
              className="absolute bottom-2 right-2 py-1 px-2.5 rounded-full text-[10px] font-extrabold bg-slate-950/85 text-rose-300 border border-rose-500/50 hover:bg-rose-950"
            >
              Discard
            </button>
          </div>
        ))}

        {canAdd && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-2xl border-2 border-dashed border-amber-500/40 hover:border-amber-400 bg-amber-950/20 hover:bg-amber-950/40 flex flex-col items-center justify-center gap-1.5 text-amber-300 transition-all"
          >
            <span className="text-2xl">📷</span>
            <span className="text-xs font-extrabold text-white">Add Photo</span>
          </button>
        )}
      </div>
      <FieldHint message={error} />
    </div>
  );
};
