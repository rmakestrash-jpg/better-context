import { z } from 'zod';

import { Agent } from './agent/service.ts';
import { Collections } from './collections/service.ts';
import { getCollectionKey } from './collections/types.ts';
import { Config } from './config/index.ts';
import { Context } from './context/index.ts';
import { getErrorMessage, getErrorTag } from './errors.ts';
import { Metrics } from './metrics/index.ts';
import { Resources } from './resources/service.ts';
import { StreamService } from './stream/service.ts';
import type { BtcaStreamMetaEvent } from './stream/types.ts';

/**
 * BTCA Server API
 *
 * Endpoints:
 *
 * GET  /                  - Health check, returns { ok, service, version }
 * GET  /config            - Returns current configuration (provider, model, directories)
 * GET  /resources         - Lists all configured resources
 * POST /question          - Ask a question (non-streaming)
 * POST /question/stream   - Ask a question (streaming SSE response)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Request Schemas
// ─────────────────────────────────────────────────────────────────────────────

const QuestionRequestSchema = z.object({
	question: z.string(),
	resources: z.array(z.string()).optional(),
	quiet: z.boolean().optional()
});

type QuestionRequest = z.infer<typeof QuestionRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Errors & Helpers
// ─────────────────────────────────────────────────────────────────────────────

class RequestError extends Error {
	readonly _tag = 'RequestError';

	constructor(message: string, cause?: unknown) {
		super(message, cause ? { cause } : undefined);
	}
}

const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json',
			...headers
		}
	});

const sse = (stream: ReadableStream<Uint8Array>) =>
	new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});

const errorToJsonResponse = (error: unknown) => {
	const tag = getErrorTag(error);
	const message = getErrorMessage(error);
	const status = tag === 'CollectionError' || tag === 'ResourceError' ? 400 : 500;
	return json({ error: message, tag }, status);
};

const decodeJson = async <T>(req: Request, schema: z.ZodType<T>): Promise<T> => {
	let body: unknown;
	try {
		body = await req.json();
	} catch (cause) {
		throw new RequestError('Failed to parse request JSON', cause);
	}

	const parsed = schema.safeParse(body);
	if (!parsed.success) throw new RequestError('Invalid request body', parsed.error);
	return parsed.data;
};

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const start = async () => {
	Metrics.info('server.starting', { port: 8080 });

	const config = await Config.load();
	Metrics.info('config.ready', {
		provider: config.provider,
		model: config.model,
		resources: config.resources.map((r) => r.name),
		resourcesDirectory: config.resourcesDirectory,
		collectionsDirectory: config.collectionsDirectory
	});

	const resources = Resources.create(config);
	const collections = Collections.create({ config, resources });
	const agent = Agent.create(config);

	// ─────────────────────────────────────────────────────────────────────────
	// Route Handlers
	// ─────────────────────────────────────────────────────────────────────────

	const handleHealth = () =>
		json({
			ok: true,
			service: 'btca-server',
			version: '0.0.1'
		});

	const handleConfig = () =>
		json({
			provider: config.provider,
			model: config.model,
			resourcesDirectory: config.resourcesDirectory,
			collectionsDirectory: config.collectionsDirectory,
			resourceCount: config.resources.length
		});

	const handleResources = () =>
		json({
			resources: config.resources.map((r) => ({
				name: r.name,
				type: r.type,
				url: r.url,
				branch: r.branch,
				searchPath: r.searchPath ?? null,
				specialNotes: r.specialNotes ?? null
			}))
		});

	const handleQuestion = async (req: Request) => {
		const decoded = await decodeJson(req, QuestionRequestSchema);
		const resourceNames =
			decoded.resources && decoded.resources.length > 0
				? decoded.resources
				: config.resources.map((r) => r.name);

		const collectionKey = getCollectionKey(resourceNames);
		Metrics.info('question.received', {
			stream: false,
			quiet: decoded.quiet ?? false,
			questionLength: decoded.question.length,
			resources: resourceNames,
			collectionKey
		});

		const collection = await collections.load({ resourceNames, quiet: decoded.quiet });
		Metrics.info('collection.ready', { collectionKey, path: collection.path });

		const result = await agent.ask({ collection, question: decoded.question });
		Metrics.info('question.done', {
			collectionKey,
			answerLength: result.answer.length,
			model: result.model
		});

		return json({
			answer: result.answer,
			model: result.model,
			resources: resourceNames,
			collection: { key: collectionKey, path: collection.path }
		});
	};

	const handleQuestionStream = async (req: Request) => {
		const decoded = await decodeJson(req, QuestionRequestSchema);
		const resourceNames =
			decoded.resources && decoded.resources.length > 0
				? decoded.resources
				: config.resources.map((r) => r.name);

		const collectionKey = getCollectionKey(resourceNames);
		Metrics.info('question.received', {
			stream: true,
			quiet: decoded.quiet ?? false,
			questionLength: decoded.question.length,
			resources: resourceNames,
			collectionKey
		});

		const collection = await collections.load({ resourceNames, quiet: decoded.quiet });
		Metrics.info('collection.ready', { collectionKey, path: collection.path });

		const { stream: eventStream, model } = await agent.askStream({
			collection,
			question: decoded.question
		});

		const meta = {
			type: 'meta',
			model,
			resources: resourceNames,
			collection: {
				key: collectionKey,
				path: collection.path
			}
		} satisfies BtcaStreamMetaEvent;

		Metrics.info('question.stream.start', { collectionKey });
		const stream = StreamService.createSseStream({ meta, eventStream });

		return sse(stream);
	};

	// ─────────────────────────────────────────────────────────────────────────
	// Router
	// ─────────────────────────────────────────────────────────────────────────

	Bun.serve({
		port: 8080,
		fetch: (req) => {
			const requestId = crypto.randomUUID();
			return Context.run({ requestId, txDepth: 0 }, async () => {
				const url = new URL(req.url);
				const method = req.method;
				const path = url.pathname;

				Metrics.info('http.request', { method, path });

				let response: Response = new Response('Internal Server Error', { status: 500 });
				try {
					// GET /
					if (method === 'GET' && path === '/') {
						response = handleHealth();
						return response;
					}

					// GET /config
					if (method === 'GET' && path === '/config') {
						response = handleConfig();
						return response;
					}

					// GET /resources
					if (method === 'GET' && path === '/resources') {
						response = handleResources();
						return response;
					}

					// POST /question
					if (method === 'POST' && path === '/question') {
						response = await handleQuestion(req);
						return response;
					}

					// POST /question/stream
					if (method === 'POST' && path === '/question/stream') {
						response = await handleQuestionStream(req);
						return response;
					}

					response = new Response('Not Found', { status: 404 });
					return response;
				} catch (cause) {
					Metrics.error('http.error', { error: Metrics.errorInfo(cause) });
					response = errorToJsonResponse(cause);
					return response;
				} finally {
					Metrics.info('http.response', {
						path,
						status: response?.status
					});
				}
			});
		}
	});
};

await start();
