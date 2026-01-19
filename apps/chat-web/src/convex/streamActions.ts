'use node';

import IORedis from 'ioredis';
import { v } from 'convex/values';
import { action } from './_generated/server';
import { streamKeys, STREAM_TTL_SECONDS } from './redis.js';

let ioRedisClient: IORedis | null = null;

const getIORedis = (): IORedis => {
	if (!ioRedisClient) {
		const url = process.env.REDIS_URL;

		if (!url) {
			throw new Error('Missing REDIS_URL environment variable');
		}

		ioRedisClient = new IORedis(url, {
			maxRetriesPerRequest: 3,
			retryStrategy: (times) => Math.min(times * 50, 2000)
		});
	}
	return ioRedisClient;
};

const STREAM_BLOCK_TIMEOUT_MS = 30000;

export const readStreamBlocking = action({
	args: {
		sessionId: v.string(),
		lastId: v.optional(v.string())
	},
	handler: async (
		_,
		args
	): Promise<{
		entries: Array<{ id: string; data?: unknown; type?: string; error?: string }>;
		lastId: string;
	}> => {
		const redis = getIORedis();
		const lastId = args.lastId ?? '0';

		const result = (await redis.call(
			'XREAD',
			'BLOCK',
			STREAM_BLOCK_TIMEOUT_MS,
			'COUNT',
			100,
			'STREAMS',
			streamKeys.channel(args.sessionId),
			lastId
		)) as [string, [string, string[]][]][] | null;

		if (!result || result.length === 0) {
			return { entries: [], lastId };
		}

		const streamData = result[0];
		if (!streamData || streamData.length < 2) {
			return { entries: [], lastId };
		}

		const messages = streamData[1];
		if (!messages || messages.length === 0) {
			return { entries: [], lastId };
		}

		const entries: Array<{ id: string; data?: unknown; type?: string; error?: string }> = [];
		let newLastId = lastId;

		for (const [id, fields] of messages) {
			newLastId = id;

			const fieldMap: Record<string, string> = {};
			for (let i = 0; i < fields.length; i += 2) {
				fieldMap[fields[i]!] = fields[i + 1]!;
			}

			if (fieldMap.type === 'done') {
				entries.push({ id, type: 'done' });
			} else if (fieldMap.type === 'error') {
				entries.push({ id, type: 'error', error: fieldMap.error });
			} else if (fieldMap.data) {
				entries.push({ id, data: JSON.parse(fieldMap.data) });
			}
		}

		return { entries, lastId: newLastId };
	}
});
