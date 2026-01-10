import type { Effect } from 'effect';

// GLOBAL RESOURCE TYPES
export interface BtcaFsResource {
	readonly _tag: 'fs-based';
	readonly name: string;
	readonly type: 'git';
	readonly specialAgentInstructions: string;
	readonly getAbsoluteDirectoryPath: Effect.Effect<string>;
	// in the future we'll add methods for updating the resource. for fs based resources the agent can just edit the files
	// but then it'll need to submit the changes
	// readonly submitChanges: Effect.Effect<void>;
}

export interface BtcaToolResource {
	readonly _tag: 'tool-based';
	readonly name: string;
	readonly type: 'todoist';
	// TODO: figure out how these all get actually passed into the agent and called
	readonly getTools: Effect.Effect<string[]>;
}

export type BtcaResource = BtcaFsResource | BtcaToolResource;

// SPECIFIC RESOURCE TYPES

export interface BtcaGitResourceArgs {
	readonly type: 'git';
	readonly name: string;
	readonly url: string;
	readonly branch: string;
	readonly repoSubPath: string;
	readonly resourcesDirectoryPath: string;
	readonly specialAgentInstructions: string;
	readonly quiet: boolean;
}
