import { createSignal, type Component, type JSX } from 'solid-js';
import { AppProvider } from './context/app-context';
import { render, useKeyboard, useRenderer } from '@opentui/solid';
import { MainUi } from '.';
import { ConsolePosition } from '@opentui/core';
import { useAppContext } from './context/app-context.tsx';

// TODO:
// - make the command palette and repo mention have arrows up and down to navigate
// - connect this up to the core process for command exec
// - probably gonna fully rebuild the way the core instance works...

const AppWrapper: Component<{
	children: JSX.Element;
}> = (props) => {
	return <AppProvider>{props.children}</AppProvider>;
};

// this is here for the debug console toggle
const App: Component = () => {
	console.log('jeb');
	const renderer = useRenderer();

	const appState = useAppContext();

	const [heightPercent, setHeightPercent] = createSignal<`${number}%`>('100%');

	useKeyboard((key) => {
		if (key.name === 'c' && key.ctrl) {
			if (appState.inputState().length > 0) {
				appState.setInputState([]);
			} else {
				renderer.destroy();
			}
		}
		if (key.raw === '\x00') {
			if (heightPercent() === '100%') {
				setHeightPercent('80%');
				renderer.console.show();
			} else {
				setHeightPercent('100%');
				renderer.console.hide();
			}
		}
		if (key.name === 'return' && appState.cursorIsCurrentlyIn() === 'text') {
			appState.addMessage({
				role: 'user',
				content: appState.inputState()
			});
			appState.setInputState([]);
		}
	});

	return <MainUi heightPercent={heightPercent} />;
};

render(
	() => (
		<AppWrapper>
			<App />
		</AppWrapper>
	),
	{
		targetFps: 60,
		consoleOptions: {
			position: ConsolePosition.BOTTOM,
			sizePercent: 20,
			maxStoredLogs: 500
		},
		exitOnCtrlC: false
	}
);
