import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

export const getRedis = (): Redis => {
	if (!redisClient) {
		const url = process.env.UPSTASH_REDIS_REST_URL;
		const token = process.env.UPSTASH_REDIS_REST_TOKEN;

		if (!url || !token) {
			throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
		}

		redisClient = new Redis({ url, token });
	}
	return redisClient;
};

export const STREAM_TTL_SECONDS = 3600;

export const streamKeys = {
	chunks: (sessionId: string) => `stream:${sessionId}:chunks`,
	status: (sessionId: string) => `stream:${sessionId}:status`,
	meta: (sessionId: string) => `stream:${sessionId}:meta`,
	channel: (sessionId: string) => `stream:${sessionId}:channel`
};

export type StreamStatus = 'streaming' | 'done' | 'error';

export type StreamMeta = {
	threadId: string;
	messageId: string;
	startedAt: number;
	error?: string;
};

export const streamOps = {
	async initStream(sessionId: string, meta: StreamMeta): Promise<void> {
		const redis = getRedis();
		const pipeline = redis.pipeline();
		pipeline.set(streamKeys.status(sessionId), 'streaming', { ex: STREAM_TTL_SECONDS });
		pipeline.set(streamKeys.meta(sessionId), JSON.stringify(meta), { ex: STREAM_TTL_SECONDS });
		pipeline.del(streamKeys.chunks(sessionId));
		pipeline.del(streamKeys.channel(sessionId));
		await pipeline.exec();
	},

	async appendChunk(sessionId: string, chunk: unknown): Promise<string> {
		const redis = getRedis();
		const chunkJson = JSON.stringify(chunk);
		const pipeline = redis.pipeline();
		pipeline.rpush(streamKeys.chunks(sessionId), chunkJson);
		pipeline.expire(streamKeys.chunks(sessionId), STREAM_TTL_SECONDS);
		pipeline.xadd(streamKeys.channel(sessionId), '*', { data: chunkJson });
		pipeline.expire(streamKeys.channel(sessionId), STREAM_TTL_SECONDS);
		const results = await pipeline.exec();
		return (results[2] as string) ?? '0-0';
	},

	async publishDone(sessionId: string): Promise<void> {
		const redis = getRedis();
		await redis.xadd(streamKeys.channel(sessionId), '*', { type: 'done' });
	},

	async publishError(sessionId: string, error: string): Promise<void> {
		const redis = getRedis();
		await redis.xadd(streamKeys.channel(sessionId), '*', { type: 'error', error });
	},

	async getChunks(sessionId: string, cursor: number = 0): Promise<unknown[]> {
		const redis = getRedis();
		const chunks = await redis.lrange(streamKeys.chunks(sessionId), cursor, -1);
		return chunks.map((c) => (typeof c === 'string' ? JSON.parse(c) : c));
	},

	async getChunkCount(sessionId: string): Promise<number> {
		const redis = getRedis();
		return await redis.llen(streamKeys.chunks(sessionId));
	},

	async getStatus(sessionId: string): Promise<StreamStatus | null> {
		const redis = getRedis();
		const status = await redis.get<StreamStatus>(streamKeys.status(sessionId));
		return status;
	},

	async getMeta(sessionId: string): Promise<StreamMeta | null> {
		const redis = getRedis();
		const meta = await redis.get<string>(streamKeys.meta(sessionId));
		if (!meta) return null;
		return typeof meta === 'string' ? JSON.parse(meta) : meta;
	},

	async setStatus(sessionId: string, status: StreamStatus, error?: string): Promise<void> {
		const redis = getRedis();
		const pipeline = redis.pipeline();
		pipeline.set(streamKeys.status(sessionId), status, { ex: STREAM_TTL_SECONDS });
		if (error) {
			const meta = await this.getMeta(sessionId);
			if (meta) {
				pipeline.set(streamKeys.meta(sessionId), JSON.stringify({ ...meta, error }), {
					ex: STREAM_TTL_SECONDS
				});
			}
		}
		await pipeline.exec();
	},

	async deleteStream(sessionId: string): Promise<void> {
		const redis = getRedis();
		const pipeline = redis.pipeline();
		pipeline.del(streamKeys.chunks(sessionId));
		pipeline.del(streamKeys.status(sessionId));
		pipeline.del(streamKeys.meta(sessionId));
		pipeline.del(streamKeys.channel(sessionId));
		await pipeline.exec();
	}
};
