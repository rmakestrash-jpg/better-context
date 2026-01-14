<script lang="ts">
	import { MessageSquare, Plus, Trash2, Loader2 } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	// Session state
	let sessions = $state<
		{
			id: string;
			status: string;
			createdAt: string;
			messageCount: number;
			threadResources: string[];
		}[]
	>([]);

	// UI state
	let isCreatingSession = $state(false);

	// Load sessions on mount
	$effect(() => {
		loadSessions();
	});

	async function loadSessions() {
		try {
			const response = await fetch('/api/sessions');
			const data = (await response.json()) as { sessions: typeof sessions };
			sessions = data.sessions;
		} catch (error) {
			console.error('Failed to load sessions:', error);
		}
	}

	async function createNewSession() {
		isCreatingSession = true;
		try {
			const response = await fetch('/api/sessions', { method: 'POST' });
			const data = (await response.json()) as { id: string; error?: string };
			if (!response.ok) throw new Error(data.error ?? 'Failed to create session');
			await loadSessions();
			goto(`/chat/${data.id}`);
		} catch (error) {
			console.error('Failed to create session:', error);
			alert(error instanceof Error ? error.message : 'Failed to create session');
		} finally {
			isCreatingSession = false;
		}
	}

	async function destroySession(sessionId: string) {
		if (!confirm('Are you sure you want to destroy this session?')) return;
		try {
			await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
			await loadSessions();
		} catch (error) {
			console.error('Failed to destroy session:', error);
		}
	}
</script>

<div class="flex flex-1 overflow-hidden">
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-semibold">Sessions</h1>
				<p class="bc-muted mt-1 text-sm">Select a session or create a new one</p>
			</div>
			<button
				type="button"
				class="bc-btn bc-btn-primary"
				onclick={createNewSession}
				disabled={isCreatingSession}
			>
				{#if isCreatingSession}
					<Loader2 size={16} class="animate-spin" /> Creating...
				{:else}
					<Plus size={16} /> New Session
				{/if}
			</button>
		</div>

		<!-- Sessions list -->
		{#if sessions.length === 0}
			<div class="bc-card flex flex-col items-center justify-center gap-4 py-16">
				<div class="bc-logoMark"><MessageSquare size={20} /></div>
				<div class="text-center">
					<h2 class="font-semibold">No sessions yet</h2>
					<p class="bc-muted mt-1 text-sm">Create a new session to get started</p>
				</div>
				<button
					type="button"
					class="bc-btn bc-btn-primary"
					onclick={createNewSession}
					disabled={isCreatingSession}
				>
					{#if isCreatingSession}
						<Loader2 size={16} class="animate-spin" /> Creating...
					{:else}
						<Plus size={16} /> New Session
					{/if}
				</button>
			</div>
		{:else}
			<div class="flex flex-col gap-3">
				{#each sessions as session (session.id)}
					<a
						href="/chat/{session.id}"
						class="bc-card flex items-center gap-4 p-4 no-underline transition-colors hover:border-[hsl(var(--bc-fg))]"
					>
						<div class="bc-logoMark shrink-0">
							<MessageSquare size={18} />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="font-medium">{session.id.slice(0, 8)}...</span>
								{#if session.status === 'active'}
									<span class="bc-badge bc-badge-success">Active</span>
								{:else if session.status === 'pending'}
									<span class="bc-badge">Ready</span>
								{:else if session.status === 'creating' || session.status === 'cloning' || session.status === 'starting'}
									<span class="bc-badge bc-badge-warning">Starting</span>
								{:else if session.status === 'error'}
									<span class="bc-badge bc-badge-error">Error</span>
								{:else}
									<span class="bc-badge">{session.status}</span>
								{/if}
							</div>
							<div class="bc-muted mt-1 flex items-center gap-4 text-xs">
								<span>{session.messageCount} messages</span>
								{#if session.threadResources.length > 0}
									<span>Resources: {session.threadResources.join(', ')}</span>
								{/if}
							</div>
						</div>
						<button
							type="button"
							class="bc-chip shrink-0 p-2"
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								destroySession(session.id);
							}}
						>
							<Trash2 size={16} />
						</button>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
