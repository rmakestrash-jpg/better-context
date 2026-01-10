import { FileSystem } from '@effect/platform';
import { Effect, Layer } from 'effect';
import { createResourceTag, ResourceError } from '../helpers';
import type { BtcaGitResourceArgs } from '../types';

const isValidGitUrl = (url: string) => /^https?:\/\//.test(url) || /^git@/.test(url);
const isValidBranch = (branch: string) => /^[\w\-./]+$/.test(branch);
const isValidPath = (path: string) => !path.includes('..') && /^[\w\-./]*$/.test(path);

const directoryExists = (path: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const exists = yield* fs.exists(path);
		if (!exists) return false;
		const stat = yield* fs.stat(path);
		return stat.type === 'Directory';
	}).pipe(Effect.orElseSucceed(() => false));

const runGit = (args: string[], options: { cwd?: string; quiet: boolean }) =>
	Effect.tryPromise({
		try: async () => {
			const stdio = options.quiet ? 'ignore' : 'inherit';
			const proc = Bun.spawn(['git', ...args], {
				cwd: options.cwd,
				stdout: stdio,
				stderr: stdio
			});
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				throw new Error(`git ${args[0]} failed with exit code ${exitCode}`);
			}
		},
		catch: (error) =>
			new ResourceError({
				message: `git ${args[0]} failed`,
				cause: error,
				stack: error instanceof Error ? error.stack : undefined
			})
	});

const gitClone = (args: {
	repoUrl: string;
	repoBranch: string;
	repoSubPath: string;
	localAbsolutePath: string;
	quiet: boolean;
}) =>
	Effect.gen(function* () {
		if (!isValidGitUrl(args.repoUrl)) {
			yield* Effect.fail(
				new ResourceError({ message: 'Invalid git URL', cause: new Error('URL validation failed') })
			);
		}
		if (!isValidBranch(args.repoBranch)) {
			yield* Effect.fail(
				new ResourceError({
					message: 'Invalid branch name',
					cause: new Error('Branch validation failed')
				})
			);
		}
		if (args.repoSubPath && !isValidPath(args.repoSubPath)) {
			yield* Effect.fail(
				new ResourceError({ message: 'Invalid path', cause: new Error('Path validation failed') })
			);
		}

		const needsSparseCheckout = args.repoSubPath && args.repoSubPath !== '/';

		const cloneArgs = needsSparseCheckout
			? [
					'clone',
					'--filter=blob:none',
					'--no-checkout',
					'--sparse',
					'-b',
					args.repoBranch,
					args.repoUrl,
					args.localAbsolutePath
				]
			: ['clone', '--depth', '1', '-b', args.repoBranch, args.repoUrl, args.localAbsolutePath];

		yield* runGit(cloneArgs, { quiet: args.quiet });

		if (needsSparseCheckout) {
			yield* runGit(['sparse-checkout', 'set', args.repoSubPath], {
				cwd: args.localAbsolutePath,
				quiet: args.quiet
			});
			yield* runGit(['checkout'], { cwd: args.localAbsolutePath, quiet: args.quiet });
		}
	});

const gitPull = (args: { localAbsolutePath: string; quiet: boolean }) =>
	runGit(['pull'], { cwd: args.localAbsolutePath, quiet: args.quiet });

const ensureGitResource = (config: BtcaGitResourceArgs) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const localPath = `${config.resourcesDirectoryPath}/${config.name}`;
		const exists = yield* directoryExists(localPath);

		if (exists) {
			yield* gitPull({ localAbsolutePath: localPath, quiet: config.quiet });
		} else {
			yield* fs.makeDirectory(config.resourcesDirectoryPath, { recursive: true });
			yield* gitClone({
				repoUrl: config.url,
				repoBranch: config.branch,
				repoSubPath: config.repoSubPath,
				localAbsolutePath: localPath,
				quiet: config.quiet
			});
		}
		return localPath;
	});

export const loadGitResource = (config: BtcaGitResourceArgs) => {
	const tag = createResourceTag(`git:${config.name}`);

	return Layer.scoped(
		tag,
		Effect.gen(function* () {
			const localPath = yield* ensureGitResource(config);

			return {
				_tag: 'fs-based',
				name: config.name,
				type: 'git',
				specialAgentInstructions: config.specialAgentInstructions,
				getAbsoluteDirectoryPath: Effect.succeed(localPath)
			};
		})
	);
};
