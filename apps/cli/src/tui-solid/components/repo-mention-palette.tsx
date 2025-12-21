import { createSignal, For, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard } from '@opentui/solid';
import { useAppContext } from '../context/app-context.tsx';

interface Repo {
	name: string;
}

export const RepoMentionPalette: Component = () => {
	const appState = useAppContext();

	const [selectedIndex, setSelectedIndex] = createSignal(0);
	// TODO: pull these in dynamically
	const [repos, setRepos] = createSignal<Repo[]>([
		{
			name: 'svelte'
		},
		{
			name: 'effect'
		},
		{
			name: 'solid'
		},
		{
			name: 'react'
		},
		{
			name: 'vue'
		},
		{
			name: 'angular'
		}
	]);

	const maxVisible = 8;

	const curInputIdx = () => {
		const inputRef = appState.inputRef();
		if (!inputRef) return 0;
		const currentInputIndex = inputRef.cursorPosition;
		let curIdx = 0;
		let totalLength = 0;
		const curInputState = appState.inputState();
		while (curIdx < curInputState.length) {
			const curItem = curInputState[curIdx]!;
			const maxIdx = totalLength + curItem.content.length;
			if (currentInputIndex >= totalLength && currentInputIndex <= maxIdx) {
				break;
			}
			totalLength = maxIdx;
			curIdx++;
		}
		return curIdx;
	};

	const filteredRepos = () => {
		const curInput = appState.inputState()[curInputIdx()]?.content;
		if (!curInput) return repos();
		const trimmedInput = curInput.toLowerCase().trim().slice(1);
		return repos().filter((repo) => repo.name.toLowerCase().includes(trimmedInput));
	};

	const visibleRange = () => {
		const start = Math.max(
			0,
			Math.min(selectedIndex() - Math.floor(maxVisible / 2), filteredRepos().length - maxVisible)
		);
		return {
			start,
			repos: filteredRepos().slice(start, start + maxVisible)
		};
	};

	useKeyboard((key) => {
		switch (key.name) {
			case 'up':
				if (selectedIndex() > 0) {
					setSelectedIndex(selectedIndex() - 1);
				} else {
					setSelectedIndex(repos().length - 1);
				}
				break;
			case 'down':
				if (selectedIndex() < repos().length - 1) {
					setSelectedIndex(selectedIndex() + 1);
				} else {
					setSelectedIndex(0);
				}
				break;
			case 'tab':
				const selectedRepoTab = filteredRepos()[selectedIndex()];
				if (selectedRepoTab) {
					const idx = curInputIdx();
					const currentState = appState.inputState();
					const newContent = '@' + selectedRepoTab.name + ' ';
					const newState = [
						...currentState.slice(0, idx),
						{ content: newContent, type: 'mention' as const },
						...currentState.slice(idx + 1)
					];
					appState.setInputState(newState);
					const inputRef = appState.inputRef();
					if (inputRef) {
						let newCursorPos = 0;
						for (let i = 0; i <= idx; i++) {
							newCursorPos += i === idx ? newContent.length : currentState[i]!.content.length;
						}
						inputRef.cursorPosition = newCursorPos;
					}
				}
				break;
			case 'return':
				const selectedRepoReturn = filteredRepos()[selectedIndex()];
				if (selectedRepoReturn) {
					const idx = curInputIdx();
					const currentState = appState.inputState();
					const newContent = '@' + selectedRepoReturn.name + ' ';
					const newState = [
						...currentState.slice(0, idx),
						{ content: newContent, type: 'mention' as const },
						...currentState.slice(idx + 1)
					];
					appState.setInputState(newState);
					const inputRef = appState.inputRef();
					if (inputRef) {
						let newCursorPos = 0;
						for (let i = 0; i <= idx; i++) {
							newCursorPos += i === idx ? newContent.length : currentState[i]!.content.length;
						}
						inputRef.cursorPosition = newCursorPos;
					}
				}
				break;
			default:
				break;
		}
	});

	return (
		<box
			style={{
				position: 'absolute',
				bottom: 5,
				left: 1,
				width: 40,
				backgroundColor: colors.bgSubtle,
				border: true,
				borderColor: colors.accent,
				flexDirection: 'column',
				padding: 1
			}}
		>
			<text fg={colors.textMuted} content=" Select repo:" />
			<For each={visibleRange().repos}>
				{(repo, i) => {
					const actualIndex = () => visibleRange().start + i();
					const isSelected = () => actualIndex() === selectedIndex();
					return (
						<text
							fg={isSelected() ? colors.accent : colors.text}
							content={isSelected() ? `▸ @${repo.name}` : `  @${repo.name}`}
						/>
					);
				}}
			</For>
		</box>
	);
};
