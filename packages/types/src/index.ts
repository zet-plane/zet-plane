// NormalizedEvent: 所有 Adapter 归一化后的统一事件格式
export interface NormalizedEvent {
  id: string
  source: string          // 'github' | 'feishu' | 'qq' | 'manual' | ...
  type: string            // 事件类型，如 'pr.merged' | 'message.created'
  projectId?: string
  payload: Record<string, unknown>
  receivedAt: Date
}
