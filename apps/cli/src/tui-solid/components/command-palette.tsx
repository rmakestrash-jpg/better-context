import { createSignal, For, Show, type Component } from 'solid-js';
import { colors } from '../theme.ts';
import { useKeyboard } from '@opentui/solid';
import { useAppContext } from '../context/app-context.tsx';
import { useRenderer } from '@opentui/solid';

interface Command {
	name: string;
	description: string;
}

export const CommandPalette: Component = () => {
	const appState = useAppContext();

	const [commands, setCommands] = createSignal<Command[]>([
		{
			name: 'help',
			description: 'Show help for a command'
		},
		{
			name: 'clear',
			description: 'Clear the screen'
		},
		{
			name: 'exit',
			description: 'Exit the CLI'
		}
	]);

	const input = () => appState.inputState()[0]?.content;

	const filteredCommands = () => {
		const curInput = input();

		if (!curInput) return commands();

		const trimmedInput = curInput.toLowerCase().trim().slice(1);

		return commands().filter((cmd) => cmd.name.toLowerCase().includes(trimmedInput));
	};

	const [selectedIndex, setSelectedIndex] = createSignal(0);

	const renderer = useRenderer();

	useKeyboard((key) => {
		switch (key.name) {
			case 'up':
				if (selectedIndex() > 0) {
					setSelectedIndex(selectedIndex() - 1);
				} else {
					setSelectedIndex(commands().length - 1);
				}
				break;
			case 'down':
				if (selectedIndex() < commands().length - 1) {
					setSelectedIndex(selectedIndex() + 1);
				} else {
					setSelectedIndex(0);
				}
				break;
			case 'tab':
				// yes this is dumb leave me alone
				const curSelectedCommand = filteredCommands()[selectedIndex()];
				if (curSelectedCommand) {
					appState.setInputState([{ content: '/' + curSelectedCommand.name, type: 'command' }]);
					const inputRef = appState.inputRef();
					if (inputRef) {
						inputRef.cursorPosition = curSelectedCommand.name.length + 2;
					}
				}
				break;
			case 'return':
				const selectedCommand = filteredCommands()[selectedIndex()];
				if (selectedCommand) {
					appState.setInputState([{ content: '/' + selectedCommand.name, type: 'command' }]);
					const inputRef = appState.inputRef();
					if (inputRef) {
						// this is kinda unhinged, but it works idk
						inputRef.cursorPosition = selectedCommand.name.length + 2;
					}
					// TODO: FIRE THE COMMAND
				}
				break;
			case 'escape':
				appState.setInputState([]);
				break;
			default:
				break;
		}
	});

	return (
		<Show
			when={commands().length > 0}
			fallback={
				<box
					style={{
						position: 'absolute',
						bottom: 4,
						left: 0,
						width: '100%',
						zIndex: 100,
						backgroundColor: colors.bgSubtle,
						border: true,
						borderColor: colors.border,
						padding: 1
					}}
				>
					<text fg={colors.textSubtle} content="No matching commands" />
				</box>
			}
		>
			<box
				style={{
					position: 'absolute',
					bottom: 4,
					left: 0,
					width: '100%',
					zIndex: 100,
					backgroundColor: colors.bgSubtle,
					border: true,
					borderColor: colors.accent,
					flexDirection: 'column',
					padding: 1
				}}
			>
				<text fg={colors.textMuted} content=" Commands" />
				<text content="" style={{ height: 1 }} />
				<For each={filteredCommands()}>
					{(cmd, i) => {
						const isSelected = () => i() === selectedIndex();
						return (
							<box style={{ flexDirection: 'row' }}>
								<text
									fg={isSelected() ? colors.accent : colors.text}
									content={isSelected() ? `▸ /${cmd.name}` : `  /${cmd.name}`}
									style={{ width: 12 }}
								/>
								<text fg={colors.textSubtle} content={` ${cmd.description}`} />
							</box>
						);
					}}
				</For>
			</box>
		</Show>
	);
};
