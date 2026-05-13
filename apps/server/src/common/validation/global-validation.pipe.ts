import { ArgumentMetadata, Injectable, PipeTransform, ValidationPipe } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'

@Injectable()
export class GlobalValidationPipe implements PipeTransform {
  private readonly zodPipe = new ZodValidationPipe()
  private readonly classValidatorPipe = new ValidationPipe()

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (isZodDtoMetatype(metadata.metatype)) {
      return this.zodPipe.transform(value, metadata)
    }

    return this.classValidatorPipe.transform(value, metadata)
  }
}

function isZodDtoMetatype(metatype: unknown): boolean {
  return typeof metatype === 'function'
    && (metatype as { isZodDto?: unknown }).isZodDto === true
}
