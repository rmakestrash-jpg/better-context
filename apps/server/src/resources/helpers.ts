import { Context, Data } from 'effect';
import { type BtcaResource } from './types';

export const createResourceTag = (resourceId: string) =>
	Context.GenericTag<BtcaResource>(`btca/resource/${resourceId}`);

export class ResourceError extends Data.TaggedError('ResourceError')<{
	readonly message: string;
	readonly cause?: unknown;
	readonly stack?: string;
}> {}
