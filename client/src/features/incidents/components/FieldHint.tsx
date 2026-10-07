import React from 'react';

/** Small inline error shown under a form section until the field is fixed. */
export const FieldHint: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <p className="text-[11px] font-semibold text-rose-300 flex items-center gap-1.5">
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
    </p>
  ) : null;
