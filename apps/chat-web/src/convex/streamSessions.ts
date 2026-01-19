import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const create = mutation({
	args: {
		threadId: v.id('threads'),
		messageId: v.id('messages'),
		sessionId: v.string()
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('streamSessions')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.filter((q) => q.eq(q.field('status'), 'streaming'))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				status: 'error',
				error: 'Superseded by new stream',
				completedAt: Date.now()
			});
		}

		return await ctx.db.insert('streamSessions', {
			threadId: args.threadId,
			messageId: args.messageId,
			sessionId: args.sessionId,
			status: 'streaming',
			startedAt: Date.now()
		});
	}
});

export const complete = mutation({
	args: {
		sessionId: v.string()
	},
	handler: async (ctx, args) => {
		const session = await ctx.db
			.query('streamSessions')
			.withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
			.first();

		if (session) {
			await ctx.db.patch(session._id, {
				status: 'done',
				completedAt: Date.now()
			});
		}
	}
});

export const fail = mutation({
	args: {
		sessionId: v.string(),
		error: v.string()
	},
	handler: async (ctx, args) => {
		const session = await ctx.db
			.query('streamSessions')
			.withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
			.first();

		if (session) {
			await ctx.db.patch(session._id, {
				status: 'error',
				error: args.error,
				completedAt: Date.now()
			});
		}
	}
});

export const getActiveForThread = query({
	args: {
		threadId: v.id('threads')
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('streamSessions')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.filter((q) => q.eq(q.field('status'), 'streaming'))
			.first();
	}
});

export const getBySessionId = query({
	args: {
		sessionId: v.string()
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('streamSessions')
			.withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
			.first();
	}
});

export const cleanupOld = mutation({
	args: {},
	handler: async (ctx) => {
		const oneHourAgo = Date.now() - 60 * 60 * 1000;

		const oldSessions = await ctx.db
			.query('streamSessions')
			.filter((q) =>
				q.or(
					q.and(q.eq(q.field('status'), 'streaming'), q.lt(q.field('startedAt'), oneHourAgo)),
					q.and(q.neq(q.field('status'), 'streaming'), q.lt(q.field('completedAt'), oneHourAgo))
				)
			)
			.collect();

		for (const session of oldSessions) {
			await ctx.db.delete(session._id);
		}

		return { deleted: oldSessions.length };
	}
});
