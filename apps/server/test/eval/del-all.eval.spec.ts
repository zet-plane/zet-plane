import { join } from 'node:path'
import { AppConfig } from '../../src/config/app-config'
import { PrismaService } from '../../src/prisma/prisma.service'
import { deleteAllProjects } from './helpers'

describe('del all project', () => {
  let prisma: PrismaService

  beforeAll(async () => {
    const config = AppConfig.load(join(process.cwd(), 'config.yaml'))
    prisma = new PrismaService(config)
    await prisma.onModuleInit()
  })

  afterAll(async () => {
    await prisma.onModuleDestroy()
  })

  it('deletes every existing project', async () => {
    await deleteAllProjects({ prisma } as Parameters<typeof deleteAllProjects>[0])

    const projects = await prisma.project.findMany({ select: { id: true } })
    expect(projects).toHaveLength(0)
  })
})
