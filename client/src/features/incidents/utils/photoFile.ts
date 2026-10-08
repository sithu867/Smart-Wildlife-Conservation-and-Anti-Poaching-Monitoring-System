/**
 * UC-B photo evidence rules and file reading (main flow steps 7-8, "Photo Capture or Storage Failure" exception).
 * Must match the server's evidence rules (server/src/modules/incidents/validation.ts).
 */
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PHOTO_ACCEPT_ATTRIBUTE = ALLOWED_PHOTO_TYPES.join(',');
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS_PER_INCIDENT = 5;

/** A photo read from the camera/file picker, ready to attach to a report. */
export interface CapturedPhoto {
  dataUrl: string;
  size: number;
  mimeType: string;
}

/** Validates a selected/captured photo and reads it as a base64 data URL. Rejects with a user-friendly message. */
export function readEvidenceFile(file: File): Promise<CapturedPhoto> {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return Promise.reject(new Error('Invalid file type: photo evidence must be a JPEG, PNG or WebP image.'));
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return Promise.reject(new Error('Image file is too large. Maximum allowed evidence size is 5MB.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Camera access error or failed to read captured image.'));
    reader.onload = event => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl === 'string' && dataUrl) {
        resolve({ dataUrl, size: file.size, mimeType: file.type });
      } else {
        reject(new Error('Unable to process captured photograph. Please try again.'));
      }
    };
    reader.readAsDataURL(file);
  });
}
