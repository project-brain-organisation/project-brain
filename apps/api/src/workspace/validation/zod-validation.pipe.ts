/**
 * zod-validation.pipe.ts — small well-known NestJS pipe that runs a Zod schema
 * at the controller boundary (Layer 1). On failure it raises BadRequestException
 * so clients receive a clean HTTP 400 with field-level detail.
 */
import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data;
  }
}
