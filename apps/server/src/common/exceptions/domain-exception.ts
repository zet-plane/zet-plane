export class DomainException<C extends string = string> extends Error {
  constructor(
    public readonly code: C,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export class NotFoundDomainException<C extends string> extends DomainException<C> {
  constructor(code: C, message: string, details?: unknown) {
    super(code, message, 404, details)
  }
}

export class ConflictDomainException<C extends string> extends DomainException<C> {
  constructor(code: C, message: string, details?: unknown) {
    super(code, message, 409, details)
  }
}
