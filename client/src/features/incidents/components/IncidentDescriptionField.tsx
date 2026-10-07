import React from 'react';
import { FieldHint } from './FieldHint';

interface IncidentDescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
}

export const IncidentDescriptionField: React.FC<IncidentDescriptionFieldProps> = ({ value, onChange, error, textareaRef }) => (
  <div className="flex flex-col gap-2">
    <label htmlFor="incident-description" className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
      Field Description & Notes <span className="text-rose-400">*</span>
    </label>
    <textarea
      id="incident-description"
      ref={textareaRef}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Describe observations, quantity, exact landmarks, or immediate action taken..."
      rows={3}
      maxLength={1000}
      aria-invalid={Boolean(error)}
      className={`w-full bg-slate-950 border rounded-2xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 shadow-inner ${
        error ? 'border-rose-500 ring-2 ring-rose-500/30' : 'border-slate-700'
      }`}
    />
    <div className="flex items-start justify-between gap-2">
      <FieldHint message={error} />
      <span className="text-[10px] text-slate-500 ml-auto">{value.length}/1000</span>
    </div>
  </div>
);
