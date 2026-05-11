export class SkipSignal extends Error {
  constructor(public readonly reason: string) {
    super('SKIP')
  }
}

// tool() factory will be added in Task 11 when @langchain/core is installed
