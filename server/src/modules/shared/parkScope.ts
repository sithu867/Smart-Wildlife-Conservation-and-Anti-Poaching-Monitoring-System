import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { isValidAnalysisId } from '../analytics/contract.js';

export const optionalParkIdSchema = z
  .string()
  .refine(isValidAnalysisId, 'Select a valid Park / Conservation Area.')
  .optional();

export function invalidParkScope(message: string): never {
  throw new z.ZodError([{ code: 'custom', path: ['parkId'], message }]);
}

export async function validateOptionalPark(
  parkId: string | undefined,
): Promise<void> {
  if (!parkId) return;
  optionalParkIdSchema.parse(parkId);
  if (
    !(await prisma.park.findUnique({
      where: { id: parkId },
      select: { id: true },
    }))
  )
    invalidParkScope('The selected Park / Conservation Area does not exist.');
}
