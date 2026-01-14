<script lang="ts">
	import { MessageSquare, Loader2, Send } from '@lucide/svelte';
	import type { Message, BtcaChunk, CancelState, ChatSession } from '$lib/types';
	import { nanoid } from 'nanoid';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChatMessages from '$lib/components/ChatMessages.svelte';

	// Get session ID from route params
	let sessionId = $derived((page.params as { id: string }).id);

	// Session state
	let currentSession = $state<{
		id: string;
		status: string;
		serverUrl: string;
		messages: Message[];
		threadResources: string[];
	} | null>(null);

	// UI state
	let isLoadingSession = $state(true);
	let isStreaming = $state(false);
	let sandboxStatus = $state<string | null>(null);
	let cancelState = $state<CancelState>('none');
	let inputValue = $state('');
	let availableResources = $state<{ name: string; type: string }[]>([]);

	// Streaming state
	let currentChunks = $state<BtcaChunk[]>([]);
	let abortController: AbortController | null = null;

	// Load session on mount and when ID changes
	$effect(() => {
		if (sessionId) {
			loadSession(sessionId);
		}
	});

	async function loadSession(id: string) {
		isLoadingSession = true;
		try {
			const response = await fetch(`/api/sessions/${id}`);
			const data = (await response.json()) as typeof currentSession & { error?: string };
			if (!response.ok) {
				console.error('Failed to load session:', data?.error);
				goto('/');
				return;
			}
			currentSession = data;
			await loadResources();
		} catch (error) {
			console.error('Failed to load session:', error);
			goto('/');
		} finally {
			isLoadingSession = false;
		}
	}

	async function loadResources() {
		if (!sessionId) return;
		try {
			const response = await fetch(`/api/sessions/${sessionId}/resources`);
			const data = (await response.json()) as { resources: typeof availableResources };
			availableResources = data.resources;
		} catch (error) {
			console.error('Failed to load resources:', error);
		}
	}

	async function clearChat() {
		if (!sessionId) return;
		try {
			await fetch(`/api/sessions/${sessionId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clear' })
			});
			await loadSession(sessionId);
		} catch (error) {
			console.error('Failed to clear chat:', error);
		}
	}

	function parseMentions(input: string): { resources: string[]; question: string } {
		const mentionRegex = /@(\w+)/g;
		const resources: string[] = [];
		let match;
		while ((match = mentionRegex.exec(input)) !== null) {
			resources.push(match[1]!);
		}
		const question = input.replace(mentionRegex, '').trim();
		return { resources: [...new Set(resources)], question };
	}

	async function sendMessage() {
		if (!sessionId || !currentSession || isStreaming || !inputValue.trim()) return;

		const { resources: mentionedResources, question } = parseMentions(inputValue);
		const threadResources = currentSession.threadResources || [];

		if (mentionedResources.length === 0 && threadResources.length === 0) {
			alert('Please @mention a resource first (e.g., @svelte)');
			return;
		}
		if (!question.trim()) {
			alert('Please enter a question after the @mention');
			return;
		}

		const validResources: string[] = [];
		const invalidResources: string[] = [];
		for (const res of mentionedResources) {
			const found = availableResources.find((r) => r.name.toLowerCase() === res.toLowerCase());
			if (found) validResources.push(found.name);
			else invalidResources.push(res);
		}
		if (invalidResources.length > 0) {
			alert(`Unknown resources: ${invalidResources.join(', ')}`);
			return;
		}

		const userMessage: Message = {
			id: nanoid(),
			role: 'user',
			content: inputValue,
			resources: validResources
		};

		currentSession.messages = [...currentSession.messages, userMessage];
		const savedInput = inputValue;
		inputValue = '';
		isStreaming = true;
		sandboxStatus = currentSession.status === 'pending' ? 'pending' : null;
		cancelState = 'none';
		currentChunks = [];
		abortController = new AbortController();

		try {
			const response = await fetch(`/api/sessions/${sessionId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: savedInput, resources: validResources }),
				signal: abortController.signal
			});

			if (!response.ok) throw new Error('Failed to send message');
			if (!response.body) throw new Error('No response body');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				let eventData = '';
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						eventData = line.slice(6);
					} else if (line === '' && eventData) {
						try {
							const event = JSON.parse(eventData) as
								| { type: 'add'; chunk: BtcaChunk }
								| { type: 'update'; id: string; chunk: Partial<BtcaChunk> }
								| { type: 'status'; status: ChatSession['status'] }
								| { type: 'done' }
								| { type: 'error'; error: string };

							if (event.type === 'status') {
								sandboxStatus = event.status;
								if (currentSession && event.status === 'active') {
									currentSession.status = 'active';
								}
							} else if (event.type === 'add') {
								sandboxStatus = null;
								currentChunks = [...currentChunks, event.chunk];
							} else if (event.type === 'update') {
								currentChunks = currentChunks.map((c) => {
									if (c.id !== event.id) return c;
									return { ...c, ...event.chunk } as BtcaChunk;
								});
							} else if (event.type === 'error') {
								throw new Error(event.error);
							}
						} catch (e) {
							if (!(e instanceof SyntaxError)) throw e;
						}
						eventData = '';
					}
				}
			}

			reader.releaseLock();

			const assistantMessage: Message = {
				id: nanoid(),
				role: 'assistant',
				content: { type: 'chunks', chunks: currentChunks }
			};
			currentSession.messages = [...currentSession.messages, assistantMessage];
			currentSession.threadResources = [...new Set([...threadResources, ...validResources])];
		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				currentSession.messages = [
					...currentSession.messages,
					{ id: nanoid(), role: 'system', content: 'Request canceled.' }
				];
			} else {
				currentSession.messages = [
					...currentSession.messages,
					{
						id: nanoid(),
						role: 'system',
						content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
					}
				];
			}
		} finally {
			isStreaming = false;
			sandboxStatus = null;
			cancelState = 'none';
			currentChunks = [];
			abortController = null;
		}
	}

	function requestCancel() {
		if (cancelState === 'none') {
			cancelState = 'pending';
		} else {
			abortController?.abort();
		}
	}

	// Input handling
	let inputEl = $state<HTMLTextAreaElement | null>(null);
	let mentionSelectedIndex = $state(0);
	let mentionMenuOpen = $state(false);
	let mentionRange = $state<{ start: number; end: number; query: string } | null>(null);

	function getMentionAtCursor(value: string, cursor: number) {
		const regex = /(^|(?<=\s))@\w*/g;
		let match;
		while ((match = regex.exec(value)) !== null) {
			const start = match.index;
			const end = match.index + match[0].length;
			if (cursor >= start && cursor <= end) {
				return { start, end, query: match[0].slice(1) };
			}
		}
		return null;
	}

	function getFilteredResources() {
		if (!mentionRange) return [];
		const query = mentionRange.query.trim().toLowerCase();
		if (!query) return availableResources;
		return availableResources.filter((r) => r.name.toLowerCase().includes(query));
	}

	function updateMentionState(resetIndex = true) {
		if (!inputEl) {
			mentionMenuOpen = false;
			mentionRange = null;
			return;
		}
		const cursor = inputEl.selectionStart ?? inputValue.length;
		const range = getMentionAtCursor(inputValue, cursor);
		mentionRange = range;
		const shouldOpen = !!range && !isStreaming && availableResources.length > 0;
		if (!shouldOpen) {
			mentionMenuOpen = false;
			mentionSelectedIndex = 0;
			return;
		}
		const filtered = getFilteredResources();
		mentionMenuOpen = filtered.length > 0;
		if (resetIndex) {
			mentionSelectedIndex = 0;
		}
	}

	function handleInputChange() {
		updateMentionState(true);
	}

	function applyMention(resourceName: string) {
		if (!mentionRange || !inputEl) return;
		const before = inputValue.slice(0, mentionRange.start);
		const after = inputValue.slice(mentionRange.end);
		const insert = `@${resourceName} `;
		inputValue = before + insert + after;
		queueMicrotask(() => {
			if (!inputEl) return;
			const cursor = before.length + insert.length;
			inputEl.focus();
			inputEl.selectionStart = cursor;
			inputEl.selectionEnd = cursor;
			updateMentionState();
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (mentionMenuOpen) {
			const filtered = getFilteredResources();
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				mentionSelectedIndex =
					filtered.length === 0 ? 0 : (mentionSelectedIndex + 1) % filtered.length;
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				mentionSelectedIndex =
					filtered.length === 0
						? 0
						: (mentionSelectedIndex - 1 + filtered.length) % filtered.length;
				return;
			}
			if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
				event.preventDefault();
				const picked = filtered[mentionSelectedIndex];
				if (picked) applyMention(picked.name);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				mentionMenuOpen = false;
				return;
			}
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
			return;
		}
		if (event.key === 'Escape' && isStreaming) {
			requestCancel();
			return;
		}
		// Only update mention state for other keys (typing), don't reset index
		queueMicrotask(() => updateMentionState(false));
	}

	function getPlaceholder(): string {
		if (isStreaming && cancelState === 'pending') return 'Press Escape again to cancel';
		if (isStreaming) return 'Press Escape to cancel';
		return '@resource question...';
	}
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
	{#if isLoadingSession}
		<div class="flex flex-1 items-center justify-center">
			<Loader2 size={32} class="animate-spin" />
		</div>
	{:else if !currentSession}
		<div class="flex flex-1 flex-col items-center justify-center gap-6 p-8">
			<div class="bc-logoMark"><MessageSquare size={20} /></div>
			<h2 class="text-xl font-semibold">Session not found</h2>
			<a href="/" class="bc-btn bc-btn-primary">Back to sessions</a>
		</div>
	{:else}
		<!-- Messages (scrollable area) -->
		<ChatMessages
			messages={currentSession.messages}
			{isStreaming}
			{sandboxStatus}
			{currentChunks}
		/>

		<!-- Input (fixed at bottom) -->
		<div class="chat-input-container shrink-0">
			{#if currentSession.threadResources.length > 0}
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<span class="bc-muted text-xs">Active:</span>
					{#each currentSession.threadResources as resource}
						<span class="bc-badge">@{resource}</span>
					{/each}
				</div>
			{/if}

			<div class="input-wrapper">
				{#if mentionMenuOpen}
					<div class="mention-menu">
						{#each getFilteredResources() as res, i (res.name)}
							<div
								class="mention-item {i === mentionSelectedIndex ? 'mention-item-selected' : ''}"
								role="option"
								tabindex="-1"
								aria-selected={i === mentionSelectedIndex}
								onmousedown={(e) => {
									e.preventDefault();
									applyMention(res.name);
								}}
							>
								<span class="font-medium">@{res.name}</span>
								<span class="bc-muted text-xs">{res.type}</span>
							</div>
						{/each}
					</div>
				{/if}

				<textarea
					class="chat-input"
					bind:this={inputEl}
					bind:value={inputValue}
					oninput={handleInputChange}
					onclick={handleInputChange}
					onkeydown={handleKeydown}
					disabled={isStreaming}
					rows="1"
					placeholder={getPlaceholder()}
				></textarea>

				<button
					type="button"
					class="send-btn"
					onclick={sendMessage}
					disabled={isStreaming || !inputValue.trim()}
				>
					{#if isStreaming}
						<Loader2 size={18} class="animate-spin" />
					{:else}
						<Send size={18} />
					{/if}
				</button>
			</div>

			<div class="bc-muted mt-2 flex items-center justify-between text-xs">
				<span>
					{#if isStreaming}
						{cancelState === 'pending' ? 'Press Escape again to cancel' : 'Streaming...'}
					{:else}
						Enter to send
					{/if}
				</span>
				{#if !isStreaming}
					<button type="button" class="text-xs hover:underline" onclick={clearChat}>Clear</button>
				{/if}
			</div>

			{#if availableResources.length > 0 && !inputValue.includes('@') && !currentSession.threadResources.length}
				<div class="bc-muted mt-1 text-xs">
					Available: {availableResources.map((r) => `@${r.name}`).join(', ')}
				</div>
			{/if}
		</div>
	{/if}
</div>
