import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../../src/app.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import { OrchestratorTaskPublisher } from '../../src/orchestrator/ingress/orchestrator-task.publisher'
import { AgentRuntimeService } from '../../src/orchestrator/runtime/agent-runtime.service'
import { LlmProviderRegistry } from '../../src/orchestrator/llm/llm-provider.registry'

export interface EvalApp {
  app: NestFastifyApplication
  prisma: PrismaService
  publisher: OrchestratorTaskPublisher
  runtime: AgentRuntimeService
  llm: LlmProviderRegistry
}

let _evalApp: EvalApp | null = null

export async function getEvalApp(): Promise<EvalApp> {
  if (_evalApp) return _evalApp

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  _evalApp = {
    app,
    prisma: moduleRef.get(PrismaService),
    publisher: moduleRef.get(OrchestratorTaskPublisher),
    runtime: moduleRef.get(AgentRuntimeService),
    llm: moduleRef.get(LlmProviderRegistry),
  }
  return _evalApp
}

export async function teardownEvalApp(): Promise<void> {
  if (_evalApp) {
    await _evalApp.app.close()
    _evalApp = null
  }
}
