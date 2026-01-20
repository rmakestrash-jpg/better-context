import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { AnalyticsEvents } from './analyticsEvents';

export const list = query({
	args: { instanceId: v.id('instances') },
	handler: async (ctx, args) => {
		const threads = await ctx.db
			.query('threads')
			.withIndex('by_instance', (q) => q.eq('instanceId', args.instanceId))
			.collect();

		const activeStreamSessions = await ctx.db
			.query('streamSessions')
			.filter((q) => q.eq(q.field('status'), 'streaming'))
			.collect();

		const streamingThreadIds = new Set(activeStreamSessions.map((s) => s.threadId.toString()));

		const threadsWithStreaming = threads.map((thread) => ({
			...thread,
			isStreaming: streamingThreadIds.has(thread._id.toString())
		}));

		return threadsWithStreaming.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
	}
});

export const getWithMessages = query({
	args: { threadId: v.id('threads') },
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread) return null;

		const messages = await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.collect();

		const threadResources = await ctx.db
			.query('threadResources')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.collect();

		const activeStreamSession = await ctx.db
			.query('streamSessions')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.filter((q) => q.eq(q.field('status'), 'streaming'))
			.first();

		return {
			...thread,
			messages: messages.sort((a, b) => a.createdAt - b.createdAt),
			resources: threadResources.map((r) => r.resourceName),
			threadResources: threadResources.map((r) => r.resourceName),
			activeStream: activeStreamSession
				? {
						sessionId: activeStreamSession.sessionId,
						messageId: activeStreamSession.messageId,
						startedAt: activeStreamSession.startedAt
					}
				: null
		};
	}
});

export const create = mutation({
	args: {
		instanceId: v.id('instances'),
		title: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const instance = await ctx.db.get(args.instanceId);

		const threadId = await ctx.db.insert('threads', {
			instanceId: args.instanceId,
			title: args.title,
			createdAt: Date.now(),
			lastActivityAt: Date.now()
		});

		if (instance) {
			await ctx.scheduler.runAfter(0, internal.analytics.trackEvent, {
				distinctId: instance.clerkId,
				event: AnalyticsEvents.THREAD_CREATED,
				properties: {
					instanceId: args.instanceId,
					threadId
				}
			});
		}

		return threadId;
	}
});

export const remove = mutation({
	args: { threadId: v.id('threads') },
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		const instance = thread ? await ctx.db.get(thread.instanceId) : null;

		const messages = await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		const threadResources = await ctx.db
			.query('threadResources')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.collect();

		for (const resource of threadResources) {
			await ctx.db.delete(resource._id);
		}

		await ctx.db.delete(args.threadId);

		if (instance) {
			await ctx.scheduler.runAfter(0, internal.analytics.trackEvent, {
				distinctId: instance.clerkId,
				event: AnalyticsEvents.THREAD_DELETED,
				properties: {
					instanceId: thread?.instanceId,
					threadId: args.threadId,
					messageCount: messages.length
				}
			});
		}
	}
});

export const clearMessages = mutation({
	args: { threadId: v.id('threads') },
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		const instance = thread ? await ctx.db.get(thread.instanceId) : null;

		const messages = await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', args.threadId))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		if (instance) {
			await ctx.scheduler.runAfter(0, internal.analytics.trackEvent, {
				distinctId: instance.clerkId,
				event: AnalyticsEvents.THREAD_CLEARED,
				properties: {
					instanceId: thread?.instanceId,
					threadId: args.threadId,
					messageCount: messages.length
				}
			});
		}
	}
});

export const updateTitle = mutation({
	args: {
		threadId: v.id('threads'),
		title: v.string()
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.threadId, { title: args.title });
	}
});
