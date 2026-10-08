/**
 * UC-B incident type picker (main flow step 6) shared by the report and edit forms.
 * Choosing "Other Threat" shows a required text box to name the threat.
 */
import React from 'react';
import { IncidentType } from '../../../shared/types/enums';
import { INCIDENT_TYPE_OPTIONS } from '../utils/incidentTypes';
import { FieldHint } from './FieldHint';

interface IncidentTypeSelectorProps {
  selectedType: IncidentType | null;
  onSelect: (type: IncidentType) => void;
  otherDescription: string;
  onOtherDescriptionChange: (value: string) => void;
  typeError?: string;
  otherError?: string;
  sectionRef?: (el: HTMLElement | null) => void;
  otherInputRef?: (el: HTMLInputElement | null) => void;
}

export const IncidentTypeSelector: React.FC<IncidentTypeSelectorProps> = ({
  selectedType,
  onSelect,
  otherDescription,
  onOtherDescriptionChange,
  typeError,
  otherError,
  sectionRef,
  otherInputRef
}) => (
  <div ref={sectionRef} className="flex flex-col gap-2">
    <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">
      Select Incident Type <span className="text-rose-400">*</span>
    </label>

    <div
      className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-2xl transition-shadow ${
        typeError ? 'ring-2 ring-rose-500/60 ring-offset-4 ring-offset-slate-950' : ''
      }`}
    >
      {INCIDENT_TYPE_OPTIONS.map(opt => {
        const isSelected = selectedType === opt.type;
        return (
          <button
            type="button"
            key={opt.type}
            onClick={() => onSelect(opt.type)}
            aria-pressed={isSelected}
            className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all active:scale-[0.98] ${
              isSelected
                ? 'bg-amber-400/10 border-amber-400 text-white shadow-lg shadow-amber-400/10'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            <span className="text-2xl p-2 rounded-xl bg-slate-950 border border-slate-800">{opt.icon}</span>
            <div>
              <span className="font-black text-sm block text-white">{opt.label}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">{opt.desc}</span>
            </div>
          </button>
        );
      })}
    </div>
    <FieldHint message={typeError} />

    {selectedType === IncidentType.OTHER && (
      <div className="mt-2">
        <label className="block text-xs font-semibold text-slate-300 mb-1 uppercase">
          Specify Other Incident Type <span className="text-rose-400">*</span>
        </label>
        <input
          ref={otherInputRef}
          type="text"
          value={otherDescription}
          onChange={e => onOtherDescriptionChange(e.target.value)}
          placeholder="Specify specific threat details..."
          maxLength={200}
          aria-invalid={Boolean(otherError)}
          className={`w-full bg-slate-950 border rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-400 ${
            otherError ? 'border-rose-500' : 'border-slate-700'
          }`}
        />
        <FieldHint message={otherError} />
      </div>
    )}
  </div>
);
