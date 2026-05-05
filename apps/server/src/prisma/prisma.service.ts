import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Prisma } from '@generated/client'

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient

  get node() { return this.client.node }
  get edge() { return this.client.edge }

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

  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' })
    this.client = new PrismaClient({ adapter })
  }

  async onModuleInit() {
    await this.client.$connect()
  }

  async onModuleDestroy() {
    await this.client.$disconnect()
  }
}
