import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { AppConfig } from './config/app-config'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  )

  const config = new DocumentBuilder()
    .setTitle('Zet Plane API')
    .setVersion('1.0')
    .addTag('graph', 'Scaffold Graph Engine')
    .addTag('knowledge', 'Knowledge Engine')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api-docs', app, document)

  const port = app.get(AppConfig).server.port
  await app.listen(port, '0.0.0.0')
}
bootstrap()
