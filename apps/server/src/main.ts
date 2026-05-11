import { join } from "path";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { AppConfig } from "./config/app-config";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.setGlobalPrefix("api");

  const config = new DocumentBuilder()
    .setTitle("Zet Plane API")
    .setVersion("1.0")
    .addTag("graph", "Scaffold Graph Engine")
    .addTag("knowledge", "Knowledge Engine")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Swagger sits outside the /api prefix intentionally
  SwaggerModule.setup("api-docs", app, document);

  // Serve the compiled SPA in production; dev traffic hits the Vite dev server
  if (process.env.NODE_ENV === "production") {
    const webDistPath = join(__dirname, "..", "..", "web", "dist");
    await app.register(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@fastify/static"),
      { root: webDistPath, prefix: "/", wildcard: false },
    );
    // SPA fallback: unknown non-/api paths serve index.html
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app
      .getHttpAdapter()
      .getInstance()
      .setNotFoundHandler((_req: unknown, reply: any) => {
        reply.sendFile("index.html");
      });
  }

  const port = app.get(AppConfig).server.port;
  await app.listen(port, "0.0.0.0");
}
bootstrap();
