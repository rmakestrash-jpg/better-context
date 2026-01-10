import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform';
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';

const ServerLayer = BunHttpServer.layer({ port: 8080 });

const httpLive = HttpRouter.empty.pipe(
	HttpRouter.get('/', HttpServerResponse.json({ message: 'Deej from bungie' })),
	HttpServer.serve(),
	HttpServer.withLogAddress,
	Layer.provide(ServerLayer)
);

BunRuntime.runMain(Layer.launch(httpLive));
