export class WaitingForApprovalSignal extends Error {
  constructor(public readonly reason: string) {
    super('WAITING_FOR_APPROVAL')
  }
}

// tool() factory will be added in Task 11 when @langchain/core is installed
