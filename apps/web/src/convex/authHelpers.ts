import { ConvexError } from 'convex/values';

import type { QueryCtx, MutationCtx, ActionCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { instances } from './apiHelpers';

type DbCtx = QueryCtx | MutationCtx;

/**
 * Gets the authenticated user's instance, or throws if not authenticated or no instance exists.
 * Use this when you want to operate on the current user's own instance.
 */
export async function getAuthenticatedInstance(ctx: DbCtx): Promise<Doc<'instances'>> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
	}

	const instance = await ctx.db
		.query('instances')
		.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
		.first();

	if (!instance) {
		throw new ConvexError({
			code: 'NOT_FOUND',
			message: 'Instance not found for authenticated user'
		});
	}

	return instance;
}

/**
 * Validates that the authenticated user owns the specified instance.
 * Returns the instance if ownership is confirmed.
 */
export async function requireInstanceOwnership(
	ctx: DbCtx,
	instanceId: Id<'instances'>
): Promise<Doc<'instances'>> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
	}

	const instance = await ctx.db.get(instanceId);
	if (!instance) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Instance not found' });
	}

	if (instance.clerkId !== identity.subject) {
		throw new ConvexError({ code: 'FORBIDDEN', message: 'Access denied' });
	}

	return instance;
}

/**
 * Validates that the authenticated user owns the thread (via its instance).
 * Returns both the thread and instance if ownership is confirmed.
 */
export async function requireThreadOwnership(
	ctx: DbCtx,
	threadId: Id<'threads'>
): Promise<{ thread: Doc<'threads'>; instance: Doc<'instances'> }> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
	}

	const thread = await ctx.db.get(threadId);
	if (!thread) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Thread not found' });
	}

	const instance = await ctx.db.get(thread.instanceId);
	if (!instance) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Instance not found' });
	}

	if (instance.clerkId !== identity.subject) {
		throw new ConvexError({ code: 'FORBIDDEN', message: 'Access denied' });
	}

	return { thread, instance };
}

/**
 * Validates that the authenticated user owns the message (via its thread's instance).
 * Returns the message, thread, and instance if ownership is confirmed.
 */
export async function requireMessageOwnership(
	ctx: DbCtx,
	messageId: Id<'messages'>
): Promise<{ message: Doc<'messages'>; thread: Doc<'threads'>; instance: Doc<'instances'> }> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
	}

	const message = await ctx.db.get(messageId);
	if (!message) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Message not found' });
	}

	const thread = await ctx.db.get(message.threadId);
	if (!thread) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Thread not found' });
	}

	const instance = await ctx.db.get(thread.instanceId);
	if (!instance) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Instance not found' });
	}

	if (instance.clerkId !== identity.subject) {
		throw new ConvexError({ code: 'FORBIDDEN', message: 'Access denied' });
	}

	return { message, thread, instance };
}

/**
 * Validates that the authenticated user owns the user resource (via its instance).
 * Returns the resource and instance if ownership is confirmed.
 */
export async function requireUserResourceOwnership(
	ctx: DbCtx,
	resourceId: Id<'userResources'>
): Promise<{ resource: Doc<'userResources'>; instance: Doc<'instances'> }> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
	}

	const resource = await ctx.db.get(resourceId);
	if (!resource) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Resource not found' });
	}

	const instance = await ctx.db.get(resource.instanceId);
	if (!instance) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Instance not found' });
	}

	if (instance.clerkId !== identity.subject) {
		throw new ConvexError({ code: 'FORBIDDEN', message: 'Access denied' });
	}

	return { resource, instance };
}

/**
 * For actions: Validates that the authenticated user owns the specified instance.
 * Returns the instance if ownership is confirmed.
 */
export async function requireInstanceOwnershipAction(
	ctx: ActionCtx,
	instanceId: Id<'instances'>
): Promise<Doc<'instances'>> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		throw new ConvexError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
	}

	const instance = await ctx.runQuery(instances.internalQueries.getInternal, { id: instanceId });
	if (!instance) {
		throw new ConvexError({ code: 'NOT_FOUND', message: 'Instance not found' });
	}

	if (instance.clerkId !== identity.subject) {
		throw new ConvexError({ code: 'FORBIDDEN', message: 'Access denied' });
	}

	return instance;
}
