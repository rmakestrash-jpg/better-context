# Web App UI Refactor Plan

## Overview

Convert the web app from a top-header layout to a sidebar layout optimized for chat interfaces. This maximizes vertical space and provides persistent navigation.

## Current State

- Top header with logo, nav links, theme toggle, user menu
- `/app` page shows thread list with InstanceCard
- `/app/chat/[id]` shows chat view
- Instance management is a collapsible card on the thread list page
- Tool calls display as individual lines in chat

## Target State

```
┌──────────────────┬─────────────────────────────────────────────┐
│                  │                                             │
│  Better Context  │                                             │
│                  │                                             │
├──────────────────┤                                             │
│ [New Thread]     │                                             │
│ [Manage Resources│              Chat Content                   │
├──────────────────┤                                             │
│ 🔍 Search...     │                                             │
├──────────────────┤                                             │
│ ┌──────────────┐ │                                             │
│ │ Instance     │ │                                             │
│ │ ● Running    │ │                                             │
│ └──────────────┘ │                                             │
├──────────────────┤                                             │
│ Thread 1         │                                             │
│ Thread 2         │                                             │
│ Thread 3         │                                             │
│ ...              │                                             │
│                  │                                             │
├──────────────────┤                                             │
│ 👤 User          │                                             │
│ ⚙️ Settings      │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

Mobile: Hamburger menu that slides out the sidebar.

---

## Phase 1: Sidebar Layout Foundation

### Task 1.1: Create Sidebar Component ✅

**File:** `apps/web/src/lib/components/Sidebar.svelte`

**Structure:**

```
- Logo section (top)
- Action buttons: New Thread, Manage Resources (side by side)
- Search input for threads
- Instance status dropdown (compact, expandable)
- Thread list (scrollable, takes remaining space)
- Bottom section: User avatar/menu, Settings icon
```

**Props:**

- `threads`: Thread list data
- `currentThreadId`: Currently active thread (for highlighting)
- `isOpen`: For mobile toggle state

**Events:**

- `close`: For mobile to close sidebar after navigation

### Task 1.2: Create Compact Instance Status Component ✅

**File:** `apps/web/src/lib/components/InstanceStatus.svelte`

Simplified version of InstanceCard for sidebar:

- Shows status badge inline (Running/Stopped/Starting/etc.)
- Click to expand dropdown with full controls
- Dropdown appears below the button, within sidebar width

### Task 1.3: Refactor App Layout ✅

**File:** `apps/web/src/routes/app/+layout.svelte`

Changes:

- Remove top header entirely
- Add Sidebar component on left
- Main content area uses `flex-1` to fill remaining space
- Add mobile hamburger button (fixed position, top-left)
- Add mobile overlay when sidebar is open

**Layout structure:**

```svelte
<div class="flex h-dvh">
	<!-- Mobile hamburger (visible on small screens) -->
	<button class="fixed top-4 left-4 z-50 lg:hidden">☰</button>

	<!-- Sidebar -->
	<aside
		class="w-64 shrink-0 ... lg:relative fixed inset-y-0 left-0 z-40 transform transition-transform lg:translate-x-0 {sidebarOpen
			? 'translate-x-0'
			: '-translate-x-full'}"
	>
		<Sidebar ... />
	</aside>

	<!-- Mobile overlay -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 bg-black/50 z-30 lg:hidden"
			onclick={() => (sidebarOpen = false)}
		></div>
	{/if}

	<!-- Main content -->
	<main class="flex-1 flex flex-col min-h-0 lg:ml-0">
		{@render children()}
	</main>
</div>
```

### Task 1.4: Update Thread List Page ✅

**File:** `apps/web/src/routes/app/+page.svelte`

Changes:

- Remove InstanceCard (now in sidebar)
- Remove thread list (now in sidebar)
- This page becomes an empty state / welcome screen when no thread is selected
- Or redirect to most recent thread

### Task 1.5: Add Sidebar CSS ✅

**File:** `apps/web/src/routes/layout.css`

Add styles for:

- `.bc-sidebar` - sidebar container
- `.bc-sidebar-section` - sections within sidebar
- `.bc-thread-item` - thread list items
- `.bc-thread-item-active` - active thread highlight
- Mobile transition animations

---

## Phase 2: Thread List & Search

### Task 2.1: Thread List in Sidebar ✅

Move thread list rendering to Sidebar component:

- Each thread shows title (or truncated ID if no title)
- Shows last activity timestamp
- Delete button on hover
- Active thread highlighted
- Scrollable container

### Task 2.2: Client-Side Thread Search ✅

In Sidebar component:

- Search input filters threads by title
- Case-insensitive matching
- Empty state when no matches
- Clear button to reset search

---

## Phase 3: Chat View Improvements

### Task 3.1: Tool Call Summary Bar ✅

**File:** `apps/web/src/lib/components/ToolCallSummary.svelte`

**Behavior:**

- Aggregate tool calls by type (grep, read, edit, etc.)
- Display as compact bar at top of assistant message
- Show counts: `grep ×3 | read ×5 | edit ×2`
- Optional: show total duration if available
- Expandable to show individual tool calls (defer for now)

**Integration in ChatMessages.svelte:**

- Replace individual tool indicators with summary bar
- Group tool chunks, render summary instead of individual items

### Task 3.2: Message Dividers ✅

**File:** `apps/web/src/lib/components/ChatMessages.svelte`

Add visual separator between conversation turns:

- After each assistant message (before next user message)
- Style: subtle horizontal line or extra spacing
- CSS class: `.bc-message-divider`

### Task 3.3: Fix Scroll Behavior ✅

**File:** `apps/web/src/routes/app/chat/[id]/+page.svelte`

Current behavior: May auto-scroll during streaming
Target behavior:

- When user sends message → scroll to bottom immediately
- During streaming → do NOT auto-scroll
- User controls their own scroll position

Implementation:

- Add `scrollToBottom()` call in `sendMessage()` after setting `isStreaming = true`
- Remove any auto-scroll logic tied to chunk updates
- Keep "Jump to bottom" button for manual scroll

### Task 3.4: Fix Light Mode Prose Colors ✅

**File:** `apps/web/src/lib/components/ChatMessages.svelte`

Problem: `prose-invert` is hardcoded, breaks light mode

Fix options:

1. Use `dark:prose-invert` instead of `prose-invert`
2. Or remove `prose-invert` entirely since CSS already defines theme-aware prose variables

Change:

```svelte
<!-- Before -->
<div class="prose prose-neutral prose-invert max-w-none">

<!-- After -->
<div class="prose prose-neutral dark:prose-invert max-w-none">
```

---

## Phase 4: Polish (Deferred)

### Task 4.1: Command Palette (DEFERRED)

- `⌘K` to open
- Search threads, actions

### Task 4.2: Keyboard Shortcuts (DEFERRED)

- `⌘N` new thread
- etc.

---

## File Change Summary

### New Files

- `apps/web/src/lib/components/Sidebar.svelte`
- `apps/web/src/lib/components/InstanceStatus.svelte`
- `apps/web/src/lib/components/ToolCallSummary.svelte`

### Modified Files

- `apps/web/src/routes/app/+layout.svelte` - Major refactor to sidebar layout
- `apps/web/src/routes/app/+page.svelte` - Simplify to empty/welcome state
- `apps/web/src/lib/components/ChatMessages.svelte` - Tool summary, dividers, prose fix
- `apps/web/src/routes/app/chat/[id]/+page.svelte` - Scroll behavior fix
- `apps/web/src/routes/layout.css` - New sidebar styles

### Potentially Affected

- `apps/web/src/lib/components/InstanceCard.svelte` - May reuse parts for InstanceStatus

---

## Implementation Order

1. **Phase 1.5**: Add sidebar CSS first (foundation)
2. **Phase 1.2**: Create InstanceStatus component
3. **Phase 1.1**: Create Sidebar component
4. **Phase 1.3**: Refactor app layout
5. **Phase 1.4**: Update thread list page
6. **Phase 2.1-2.2**: Thread search (part of Sidebar)
7. **Phase 3.4**: Fix light mode prose (quick win)
8. **Phase 3.2**: Message dividers (quick win)
9. **Phase 3.3**: Fix scroll behavior
10. **Phase 3.1**: Tool call summary bar

---

## Testing Checklist

- [ ] Sidebar displays correctly on desktop (always visible)
- [ ] Sidebar hidden by default on mobile, hamburger visible
- [ ] Hamburger opens sidebar with slide animation
- [ ] Clicking overlay or navigation closes sidebar on mobile
- [ ] Thread list populates and scrolls
- [ ] Thread search filters correctly
- [ ] Active thread is highlighted
- [ ] Instance status shows correct state
- [ ] Instance dropdown expands/collapses
- [ ] Instance controls work (wake/stop/update)
- [ ] User menu works in sidebar
- [ ] Settings navigation works
- [ ] New Thread button creates thread
- [ ] Manage Resources navigates correctly
- [ ] Chat view has full vertical space
- [ ] Tool calls show as summary bar
- [ ] Message dividers appear between turns
- [ ] Scroll jumps to bottom on send
- [ ] Scroll does NOT auto-follow during stream
- [ ] Light mode text is readable
- [ ] Dark mode still works correctly
