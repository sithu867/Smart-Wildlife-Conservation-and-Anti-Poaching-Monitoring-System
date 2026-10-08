/**
 * UC-B error popup used by every incident CRUD screen.
 *  - validation: lists all missing/invalid fields at once, each with an action button that jumps to the field
 *    ("Missing Required Information" exception flow);
 *  - submit: explains why the server refused a create/edit/delete, optionally with custom actions.
 */
import React, { useEffect, useRef } from 'react';

/** Form sections that can be highlighted and jumped to. */
export type IncidentField = 'location' | 'incidentType' | 'otherTypeDescription' | 'imageUrl' | 'description';

/** One problem shown in the popup. */
export interface ValidationIssue {
  field?: IncidentField;
  icon: string;
  title: string;
  message: string;
  /** Short action-specific button text, e.g. "Add Photo" */
  actionLabel?: string;
}

/** A custom popup button. */
export interface DialogAction {
  label: string;
  onClick: () => void;
}

/** Optional overrides of the popup's wording and buttons (e.g. for edit-specific situations). */
export interface DialogOverrides {
  eyebrow?: string;
  heading?: string;
  intro?: string;
  /** When set, replaces the default footer with [secondary (default: Close)] + [primary] */
  primaryAction?: DialogAction;
  secondaryAction?: DialogAction;
}

interface ValidationErrorDialogProps extends DialogOverrides {
  variant: 'validation' | 'submit';
  issues: ValidationIssue[];
  onClose: () => void;
  onFix?: (field: IncidentField) => void;
}

const SECONDARY_BUTTON_CLASS = 'w-1/2 py-3.5 px-4 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all';
const PRIMARY_BUTTON_CLASS =
  'py-3.5 px-4 rounded-xl font-black bg-amber-400 text-slate-950 hover:bg-amber-300 text-xs shadow-lg shadow-amber-400/20 active:scale-[0.98] transition-all';

export const ValidationErrorDialog: React.FC<ValidationErrorDialogProps> = ({
  variant,
  issues,
  onClose,
  onFix,
  eyebrow,
  heading: headingOverride,
  intro,
  primaryAction,
  secondaryAction
}) => {
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const isValidation = variant === 'validation';
  const firstFixable = issues.find(issue => issue.field);

  useEffect(() => {
    primaryButtonRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const heading =
    headingOverride ??
    (isValidation
      ? issues.length === 1
        ? '1 detail needs your attention'
        : `${issues.length} details need your attention`
      : "We couldn't submit your report");

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incident-error-dialog-title"
        aria-describedby="incident-error-dialog-list"
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 w-full max-w-md shadow-2xl shadow-rose-950/50 flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-rose-950 border border-rose-500/40 flex items-center justify-center text-2xl shadow-lg">
            {isValidation ? '📝' : '⚠️'}
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
            {eyebrow ?? (isValidation ? 'Before you continue' : 'Submission failed')}
          </span>
          <h3 id="incident-error-dialog-title" className="text-lg font-black text-white leading-tight">
            {heading}
          </h3>
          <p className="text-xs text-slate-400">
            {intro ??
              (isValidation
                ? 'Please complete the items below so rangers and managers get an accurate report.'
                : 'Your draft is still here and nothing was lost. Review the problem below and try again.')}
          </p>
        </div>

        <ul id="incident-error-dialog-list" className="flex flex-col gap-2.5">
          {issues.map((issue, idx) => (
            <li
              key={`${issue.field ?? 'general'}-${idx}`}
              className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-start gap-3"
            >
              <span className="text-xl w-10 h-10 shrink-0 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                {issue.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-white">{issue.title}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-snug">{issue.message}</p>
              </div>
              {issue.field && onFix && (
                <button
                  type="button"
                  onClick={() => onFix(issue.field!)}
                  className="shrink-0 self-center py-1.5 px-3 rounded-full bg-amber-400/10 border border-amber-400/50 text-amber-300 hover:bg-amber-400/20 text-[11px] font-extrabold"
                  aria-label={`${issue.actionLabel ?? 'Go to field'}: ${issue.title}`}
                >
                  {issue.actionLabel ?? 'Go to Field'}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="flex gap-3 mt-1">
          {primaryAction ? (
            <>
              <button type="button" onClick={secondaryAction?.onClick ?? onClose} className={SECONDARY_BUTTON_CLASS}>
                {secondaryAction?.label ?? 'Close'}
              </button>
              <button ref={primaryButtonRef} type="button" onClick={primaryAction.onClick} className={`w-1/2 ${PRIMARY_BUTTON_CLASS}`}>
                {primaryAction.label}
              </button>
            </>
          ) : isValidation && firstFixable && onFix ? (
            <>
              <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
                Close
              </button>
              <button
                ref={primaryButtonRef}
                type="button"
                onClick={() => onFix(firstFixable.field!)}
                className={`w-1/2 ${PRIMARY_BUTTON_CLASS}`}
              >
                Take Me There →
              </button>
            </>
          ) : (
            <button ref={primaryButtonRef} type="button" onClick={onClose} className={`w-full ${PRIMARY_BUTTON_CLASS}`}>
              OK, Got It
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
