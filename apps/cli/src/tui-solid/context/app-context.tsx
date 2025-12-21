// STUFF I WANT TO STORE IN HERE
// selected model
// message history for current thread (for now these are just in memory)

import type { InputRenderable } from '@opentui/core';
import { createContext, createSignal, useContext, type Accessor, type JSX } from 'solid-js';
import { createStore } from 'solid-js/store';

type InputState = {
	type: 'text' | 'command' | 'mention';
	content: string;
}[];

type Message =
	| {
			role: 'user';
			content: InputState;
	  }
	| {
			role: 'assistant';
			content: string;
	  }
	| {
			role: 'system';
			content: string;
	  };

type AppState = {
	inputState: Accessor<InputState>;
	setCursorPosition: (position: number) => void;
	cursorIsCurrentlyIn: Accessor<InputState[number]['type']>;
	setInputState: (state: InputState) => void;
	selectedModel: Accessor<string>;
	selectedProvider: Accessor<string>;
	setModel: (model: string) => void;
	setProvider: (provider: string) => void;
	messageHistory: Accessor<Message[]>;
	addMessage: (message: Message) => void;
	clearMessages: () => void;
	inputRef: Accessor<InputRenderable | null>;
	setInputRef: (ref: InputRenderable | null) => void;
};

const defaultMessageHistory: Message[] = [
	{
		role: 'system',
		content:
			"Welcome to btca! Ask anything about the library/framework you're interested in (make sure you @ it first)"
	}
];

const AppContext = createContext<AppState>();

export const useAppContext = () => {
	const context = useContext(AppContext);

	if (!context) {
		throw new Error('useAppContext must be used within an AppProvider');
	}

	return context;
};

export const AppProvider = (props: { children: JSX.Element }) => {
	// TODO: get these from the actual core process
	const [selectedModel, setSelectedModel] = createSignal('claude-haiku-4-5');
	const [selectedProvider, setSelectedProvider] = createSignal('anthropic');
	const [messageHistory, setMessageHistory] = createSignal<Message[]>(defaultMessageHistory);
	const [cursorPosition, setCursorPosition] = createSignal(0);

	const [inputStore, setInputStore] = createSignal<InputState>([]);

	const [inputRef, setInputRef] = createSignal<InputRenderable | null>(null);

	const state: AppState = {
		inputState: inputStore,
		inputRef,
		setInputRef,
		setCursorPosition,
		cursorIsCurrentlyIn: () => {
			let curIdx = 0;
			let minIdx = 0;
			while (true) {
				const curItem = inputStore()[curIdx];
				if (!curItem) return 'text';
				const maxIdx = minIdx + curItem.content.length;
				if (cursorPosition() >= minIdx && cursorPosition() <= maxIdx) return curItem.type;
				minIdx = maxIdx;
				curIdx++;
			}
		},
		setInputState: setInputStore,
		selectedModel,
		selectedProvider,
		messageHistory,
		setModel: setSelectedModel,
		setProvider: setSelectedProvider,
		addMessage: (message: Message) => {
			setMessageHistory((prev) => [...prev, message]);
		},
		clearMessages: () => {
			setMessageHistory(defaultMessageHistory);
		}
	};

	return <AppContext.Provider value={state}>{props.children}</AppContext.Provider>;
};
