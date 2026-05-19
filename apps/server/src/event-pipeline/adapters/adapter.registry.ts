import { Injectable } from '@nestjs/common'
import type { IWebhookAdapter } from './adapter.interface'
import type { EventSource } from '../types'

@Injectable()
export class AdapterRegistry {
  private readonly map = new Map<EventSource, IWebhookAdapter>()

  register(adapter: IWebhookAdapter): void {
    this.map.set(adapter.source, adapter)
  }

  get(source: string): IWebhookAdapter | undefined {
    return this.map.get(source as EventSource)
  }
}
