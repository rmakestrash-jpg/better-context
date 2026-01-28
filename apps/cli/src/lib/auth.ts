/**
 * Auth helpers for btca CLI
 * Shared authentication functions for remote commands
 */

const GLOBAL_CONFIG_DIR = '~/.config/btca';
const REMOTE_AUTH_FILENAME = 'remote-auth.json';

const expandHome = (filePath: string): string => {
	const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
	if (filePath.startsWith('~/')) return home + filePath.slice(1);
	return filePath;
};

export interface RemoteAuth {
	apiKey: string;
	linkedAt: number;
}

export async function getAuthPath(): Promise<string> {
	return `${expandHome(GLOBAL_CONFIG_DIR)}/${REMOTE_AUTH_FILENAME}`;
}

export async function loadAuth(): Promise<RemoteAuth | null> {
	const authPath = await getAuthPath();
	try {
		const content = await Bun.file(authPath).text();
		return JSON.parse(content) as RemoteAuth;
	} catch {
		return null;
	}
}

export async function saveAuth(auth: RemoteAuth): Promise<void> {
	const authPath = await getAuthPath();
	const configDir = authPath.slice(0, authPath.lastIndexOf('/'));

	await Bun.write(`${configDir}/.keep`, '');
	await Bun.write(authPath, JSON.stringify(auth, null, 2));
}

export async function deleteAuth(): Promise<void> {
	const authPath = await getAuthPath();
	try {
		const fs = await import('node:fs/promises');
		await fs.unlink(authPath);
	} catch {
		// Ignore if file doesn't exist
	}
}
