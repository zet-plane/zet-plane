export class DomainServiceError extends Error {
  constructor(public readonly reason: string) {
    super(`DOMAIN_SERVICE_ERROR: ${reason}`)
  }
}

// Full tool implementation in Task 10
