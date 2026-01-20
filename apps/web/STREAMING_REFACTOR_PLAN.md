# Streaming Refactor Plan: Drop Redis, Native Convex

## Overview

This document outlines the plan to remove Redis from the streaming architecture and move to a Convex-native approach. The goal is to simplify the infrastructure while fixing a UI bug where streaming state bleeds across threads.

## Current Architecture (Problems)

### How It Works Now

1. Client sends `POST /chat/stream` to Convex HTTP action
2. HTTP action creates:
   - Assistant message in Convex (empty initially)
   - Stream session in Convex (`streamSessions` table)
   - Stream metadata in Redis (status, meta, chunks list, pub/sub channel)
3. For each chunk from btca server:
   - Append to Redis list (`RPUSH`)
   - Publish to Redis stream (`XADD`)
   - Send via SSE to client
4. On completion:
   - Update Convex message with final chunks
   - Mark Redis status as 'done'
   - Mark Convex session as 'done'

### Redis Data Structures (per session)

| Key Pattern                  | Type        | Purpose                               |
| ---------------------------- | ----------- | ------------------------------------- |
| `stream:{sessionId}:chunks`  | List        | Stores all chunks for resumability    |
| `stream:{sessionId}:status`  | String      | 'streaming' / 'done' / 'error'        |
| `stream:{sessionId}:meta`    | JSON String | threadId, messageId, startedAt, error |
| `stream:{sessionId}:channel` | Stream      | Real-time pub/sub for blocking reads  |

### Problems

1. **High Redis Write Volume**: ~400 Redis operations per typical stream (4 ops per chunk)
2. **Dual Storage Redundancy**: Chunks stored in Redis list AND published to Redis stream, then final content also in Convex
3. **Two Redis Clients**: Upstash REST for non-blocking, ioredis for blocking `XREAD`
4. **UI Bug**: Streaming state is global to the component, not scoped to thread - causes streams to display on wrong threads when navigating

---

## New Architecture

### Design Principles

1. **Convex as single source of truth** for persistence
2. **HTTP SSE for real-time streaming** (already works)
3. **No mid-stream resume** - accept that reconnecting means waiting for completion
4. **Thread-scoped streaming state** - fix the UI bug

### Data Flow

```
1. User sends message
   └─► POST /chat/stream
       ├─► Create assistant message (empty)
       ├─► Create streamSession (status: 'streaming')
       ├─► Send 'session' event to client
       ├─► Fetch from btca server
       ├─► For each chunk: send via SSE to client (NO REDIS)
       └─► On completion:
           ├─► Update message with final content
           └─► Mark session 'done'

2. Client disconnects mid-stream
   └─► HTTP action continues running
       └─► Completes normally, updates Convex

3. Client reconnects (or navigates back)
   └─► Convex query returns thread with activeStream
       ├─► If activeStream exists: show "in progress" UI
       └─► When stream completes: Convex subscription updates
           └─► Message appears, activeStream becomes null
```

---

## Files to Change

### Files to DELETE

| File                          | Reason                                 |
| ----------------------------- | -------------------------------------- |
| `src/convex/redis.ts`         | Redis client and all stream operations |
| `src/convex/streamActions.ts` | Blocking Redis XREAD action            |

### Files to MODIFY

| File                                     | Changes                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `src/convex/http.ts`                     | Remove Redis imports/calls, remove resume endpoints                   |
| `src/convex/threads.ts`                  | Add `activeStream` to `getWithMessages` query                         |
| `src/convex/crons.ts`                    | Verify no Redis references (keep session cleanup)                     |
| `src/routes/app/chat/[id]/+page.svelte`  | Fix thread-scoping bug, remove resume logic, add background stream UI |
| `src/lib/components/ChatMessages.svelte` | Add "stream in progress" indicator                                    |
| `package.json`                           | Remove `@upstash/redis` and `ioredis` dependencies                    |

---

## Detailed Implementation

### 1. Delete Redis Files

Delete these files entirely:

- `apps/web/src/convex/redis.ts`
- `apps/web/src/convex/streamActions.ts`

### 2. Update `src/convex/http.ts`

#### Remove Imports

```typescript
// DELETE these lines:
import { streamOps } from './redis.js';
```

#### Remove HTTP Routes

Delete these route registrations and their handlers:

- `POST /chat/stream/resume` - `streamResume` handler
- `GET /chat/stream/status` - `streamStatus` handler
- `GET /chat/stream/active` - `getActiveStream` handler

Keep only:

- `POST /chat/stream` - `chatStream` handler
- `OPTIONS /chat/stream` - CORS preflight

#### Simplify `chatStream` Handler

**Current code in the streaming loop:**

```typescript
// For each chunk:
const update = processStreamEvent(event, chunksById, chunkOrder);
if (update) {
	await streamOps.appendChunk(sessionId, update); // DELETE THIS
	sendEvent(update);
}
```

**New code:**

```typescript
// For each chunk:
const update = processStreamEvent(event, chunksById, chunkOrder);
if (update) {
	sendEvent(update); // Just send via SSE, no Redis
}
```

**Current completion code:**

```typescript
await streamOps.publishDone(sessionId); // DELETE
await streamOps.setStatus(sessionId, 'done'); // DELETE
await ctx.runMutation(api.streamSessions.complete, { sessionId });
```

**New completion code:**

```typescript
await ctx.runMutation(api.streamSessions.complete, { sessionId });
```

**Current error handling:**

```typescript
await streamOps.publishError(sessionId, errorMessage); // DELETE
await streamOps.setStatus(sessionId, 'error', errorMessage); // DELETE
await ctx.runMutation(api.streamSessions.fail, { sessionId, error: errorMessage });
```

**New error handling:**

```typescript
await ctx.runMutation(api.streamSessions.fail, { sessionId, error: errorMessage });
```

**Also remove:**

- `await streamOps.initStream(...)` call at stream start

### 3. Update `src/convex/threads.ts`

Modify `getWithMessages` to include active stream info:

```typescript
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

		// NEW: Check for active streaming session
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
			// NEW: Include streaming state for "in progress" UI
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
```

### 4. Update `src/convex/crons.ts`

Verify the file only references `api.streamSessions.cleanupOld` (which is Convex-based, not Redis):

```typescript
import { cronJobs } from 'convex/server';
import { api, internal } from './_generated/api.js';

const crons = cronJobs();

crons.cron('nightly-updates', '0 3 * * *', internal.scheduled.updates.runUpdates, {});
crons.interval('version-check', { hours: 6 }, internal.scheduled.versionCheck.checkVersions, {});
crons.interval('cleanup-stream-sessions', { minutes: 15 }, api.streamSessions.cleanupOld, {});

export default crons;
```

This should already be correct - no changes needed.

### 5. Update `src/routes/app/chat/[id]/+page.svelte`

This is the most complex change. It fixes the thread-scoping bug and removes resume logic.

#### Add Thread-Scoped Streaming State

```typescript
// EXISTING state
let isStreaming = $state(false);
let streamStatus = $state<string | null>(null);
let currentChunks = $state<BtcaChunk[]>([]);

// NEW: Track which thread we're streaming for
let streamingForThreadId = $state<Id<'threads'> | null>(null);
```

#### Add Derived Values

```typescript
// NEW: Only show local streaming UI if it's for THIS thread
const isStreamingThisThread = $derived(isStreaming && streamingForThreadId === threadId);

// NEW: Get active stream from Convex (for background streams)
const activeStream = $derived(thread?.activeStream ?? null);

// NEW: Show "in progress" indicator when there's a background stream
// (stream running but we're not connected to it)
const hasBackgroundStream = $derived(activeStream !== null && !isStreamingThisThread);
```

#### Remove Resume Logic

Delete these entirely:

- `hasCheckedForActiveStream` state variable
- `currentSessionId` state variable (unless needed elsewhere)
- The `$effect` that calls `checkActiveStream`
- The `resumeStream()` function
- The `$effect` that resets `hasCheckedForActiveStream` on thread change

#### Add Thread Change Cleanup Effect

```typescript
// Reset streaming display state when navigating to a different thread
$effect(() => {
	threadId; // Track threadId changes

	// If we're viewing a different thread than what we're streaming for,
	// clear the local display state (stream continues in background)
	if (streamingForThreadId !== null && streamingForThreadId !== threadId) {
		currentChunks = [];
		streamStatus = null;
		pendingUserMessage = null;
		// Note: Don't reset isStreaming - let the HTTP request complete
		// The stream will update Convex when done
	}
});
```

#### Update `sendMessage()` Function

Set `streamingForThreadId` when starting a stream:

```typescript
async function sendMessage() {
	// ... existing validation code ...

	// If this is a new thread, create it first
	let actualThreadId = threadId;
	if (isNewThread) {
		const newThreadId = await client.mutation(api.threads.create, {
			instanceId: auth.instanceId
		});
		actualThreadId = newThreadId;
		await goto(`/app/chat/${newThreadId}`, { replaceState: true });
	}

	// NEW: Track which thread this stream is for
	streamingForThreadId = actualThreadId;

	isStreaming = true;
	// ... rest of function ...
}
```

In the `finally` block, reset `streamingForThreadId`:

```typescript
} finally {
    isStreaming = false;
    streamStatus = null;
    cancelState = 'none';
    currentChunks = [];
    pendingUserMessage = null;
    streamingForThreadId = null;  // NEW: Reset thread tracking
    abortController = null;
    if (shouldRefreshUsage) {
        void billingStore.refetch();
    }
}
```

#### Update ChatMessages Props

```svelte
<ChatMessages
	bind:this={chatMessagesRef}
	messages={displayMessages}
	isStreaming={isStreamingThisThread}
	{streamStatus}
	{currentChunks}
	{activeStream}
	{hasBackgroundStream}
/>
```

### 6. Update `src/lib/components/ChatMessages.svelte`

#### Update Props Interface

```typescript
interface Props {
	messages: Message[];
	isStreaming: boolean;
	streamStatus: string | null;
	currentChunks: BtcaChunk[];
	// NEW props for background stream indicator
	activeStream: { sessionId: string; messageId: string; startedAt: number } | null;
	hasBackgroundStream: boolean;
}

let {
	messages,
	isStreaming,
	streamStatus,
	currentChunks,
	activeStream,
	hasBackgroundStream
}: Props = $props();
```

#### Add Helper Function for Relative Time

```typescript
function formatRelativeTime(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ago`;
}
```

#### Add Background Stream Indicator UI

Add this after the messages loop, before the streaming status section:

```svelte
<!-- Background stream in progress indicator -->
{#if hasBackgroundStream && activeStream}
	<div class="chat-message chat-message-system">
		<div class="flex items-center gap-3">
			<div class="sandbox-status-indicator">
				<Loader2 size={16} class="animate-spin text-[hsl(var(--bc-accent))]" />
			</div>
			<div>
				<div class="text-sm font-medium">Response in progress</div>
				<div class="bc-muted text-xs">
					Started {formatRelativeTime(activeStream.startedAt)}. The response will appear
					automatically when complete.
				</div>
			</div>
		</div>
	</div>
{/if}
```

### 7. Update `package.json`

Remove Redis dependencies:

```bash
# Run from apps/web directory
bun remove @upstash/redis ioredis
```

Also remove `@types/ioredis` if present (though ioredis has built-in types).

### 8. Remove Environment Variables (Optional Cleanup)

These can be removed from deployment configs:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `REDIS_URL`

---

## Testing Checklist

### Basic Streaming

- [ ] Send a message, verify stream works end-to-end
- [ ] Verify chunks appear in real-time
- [ ] Verify final message is saved to Convex
- [ ] Verify stream session marked as 'done'

### Thread Navigation Bug Fix

- [ ] Start a stream on Thread A
- [ ] Navigate to Thread B while streaming
- [ ] Verify Thread B does NOT show the streaming chunks
- [ ] Navigate back to Thread A
- [ ] Verify Thread A shows "in progress" indicator (if stream still running)
- [ ] Wait for stream to complete
- [ ] Verify message appears on Thread A

### Error Handling

- [ ] Simulate stream error, verify error state
- [ ] Verify message marked as canceled on error

### Edge Cases

- [ ] Start stream, close browser tab, reopen - should see completed message or "in progress"
- [ ] Start stream on new thread (creates thread first)
- [ ] Multiple rapid messages (should supersede)

---

## Rollback Plan

If issues arise:

1. Revert the commits
2. Redis data is ephemeral (1hr TTL) so no data migration needed
3. Re-add dependencies: `bun add @upstash/redis ioredis`

---

## Future Enhancements (Out of Scope for v1)

If mid-stream resume is needed later:

1. Store chunks in Convex `streamChunks` table during streaming
2. Client subscribes to chunks query for real-time updates
3. On reconnect, fetch existing chunks from Convex, subscribe for new ones

This would require more Convex writes during streaming but eliminates Redis entirely while supporting resume.
