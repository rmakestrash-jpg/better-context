import type { TaggedErrorOptions } from '../errors.ts';

export type CollectionResult = {
	path: string;
	agentInstructions: string;
};

export class CollectionError extends Error {
	readonly _tag = 'CollectionError';
	override readonly cause?: unknown;
	readonly hint?: string;

	constructor(args: TaggedErrorOptions) {
		super(args.message);
		this.cause = args.cause;
		this.hint = args.hint;
	}
}

export const getCollectionKey = (resourceNames: readonly string[]): string => {
	return [...resourceNames].sort().join('+');
};
