import { For, Show, type Component } from 'solid-js';
import { colors } from '../theme';
import { useAppContext } from '../context/app-context';

export const MainInput: Component = () => {
	const appState = useAppContext();

	const getValue = () =>
		appState
			.inputState()
			.map((p) => p.content)
			.join('');

	const isEmpty = () => getValue().length === 0;

	const getColor = (type: 'text' | 'command' | 'mention') => {
		switch (type) {
			case 'mention':
				return colors.accent;
			case 'command':
				return '#FFD700'; // gold
			default:
				return colors.text;
		}
	};

	function parseInputValue(value: string): ReturnType<typeof appState.inputState> {
		if (!value) return [];
		const parts: { type: 'text' | 'command' | 'mention'; content: string }[] = [];

		if (value.startsWith('/')) {
			const spaceIndex = value.indexOf(' ');
			if (spaceIndex === -1) {
				parts.push({ type: 'command', content: value });
			} else {
				parts.push({ type: 'command', content: value.slice(0, spaceIndex) });
				parts.push({ type: 'text', content: value.slice(spaceIndex) });
			}
			return parts;
		}

		const regex = /(^|(?<=\s))@\w*/g;
		let lastIndex = 0;
		let match;
		while ((match = regex.exec(value)) !== null) {
			if (match.index > lastIndex) {
				parts.push({ type: 'text', content: value.slice(lastIndex, match.index) });
			}
			parts.push({ type: 'mention', content: match[0] });
			lastIndex = regex.lastIndex;
		}

		if (lastIndex < value.length) {
			parts.push({ type: 'text', content: value.slice(lastIndex) });
		}
		return parts;
	}

	return (
		<box
			style={{
				border: true,
				borderColor: colors.accent,
				height: 3,
				width: '100%'
			}}
		>
			{/* Styled text overlay - positioned on top of input */}
			<text
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: 1,
					zIndex: 2,
					paddingLeft: 1,
					paddingRight: 1
				}}
			>
				<Show
					when={!isEmpty()}
					fallback={
						<span style={{ fg: colors.textSubtle }}>@repo question... or / for commands</span>
					}
				>
					<For each={appState.inputState()}>
						{(part) => <span style={{ fg: getColor(part.type) }}>{part.content}</span>}
					</For>
				</Show>
			</text>
			{/* Hidden input - handles actual typing and cursor */}
			<input
				id="main-input"
				onInput={(v) => {
					const parts = parseInputValue(v);
					appState.setInputState(parts);
				}}
				onKeyDown={() => {
					queueMicrotask(() => {
						const inputRef = appState.inputRef();
						if (!inputRef) return;
						appState.setCursorPosition(inputRef.cursorPosition);
					});
				}}
				value={getValue()}
				focused={true}
				ref={(r) => appState.setInputRef(r)}
				onMouseDown={(e) => {
					const inputRef = appState.inputRef();
					if (!inputRef) return;
					inputRef.cursorPosition = e.x - 2;
					queueMicrotask(() => {
						appState.setCursorPosition(inputRef.cursorPosition);
					});
				}}
				// Make input text transparent so styled overlay shows through
				textColor="transparent"
				backgroundColor="transparent"
				focusedBackgroundColor="transparent"
				cursorColor={colors.accent}
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					height: 1,
					zIndex: 1, // Below the styled text
					paddingLeft: 1,
					paddingRight: 1
				}}
			/>
		</box>
	);
};
