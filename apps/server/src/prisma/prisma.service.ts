import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Prisma } from '@generated/client'
import { AppConfig } from '../config/app-config'

export type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient

  get node() { return this.client.node }
  get edge() { return this.client.edge }
  get knowledgeEntry() { return this.client.knowledgeEntry }
  get knowledgeRevision() { return this.client.knowledgeRevision }
  get project() { return this.client.project }

  // Overloads mirror PrismaClient.$transaction so callers (GraphRepository) compile correctly.
  $transaction<P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<{ [K in keyof P]: Awaited<P[K]> }>
  $transaction<R>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<R>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<R>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction(...args: any[]): any {
    return (this.client.$transaction as (...a: unknown[]) => unknown)(...args)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $executeRaw(query: any): Promise<number> {
    return (this.client.$executeRaw as (...a: unknown[]) => Promise<number>)(query)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRaw<T = unknown>(query: any): Promise<T> {
    return (this.client.$queryRaw as (...a: unknown[]) => Promise<T>)(query)
  }

  constructor(cfg: AppConfig) {
    const adapter = new PrismaPg({ connectionString: cfg.database.url })
    this.client = new PrismaClient({ adapter })
  }

  async onModuleInit() {
    await this.client.$connect()
  }

  async onModuleDestroy() {
    await this.client.$disconnect()
  }
}
