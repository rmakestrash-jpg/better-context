/**
 * OpenCode Config Reader
 * Reads custom provider configurations from OpenCode's config files
 *
 * OpenCode config locations:
 * - Global: ~/.config/opencode/opencode.json (or opencode.jsonc)
 * - Project: ./opencode.json (or opencode.jsonc)
 * - Windows: %USERPROFILE%/.config/opencode/opencode.json
 */
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderFactory, ProviderOptions } from './registry.ts';

// Schema for custom provider model config
const ModelConfigSchema = z.object({
	name: z.string().optional(),
	limit: z
		.object({
			context: z.number().optional(),
			output: z.number().optional()
		})
		.optional(),
	options: z.record(z.unknown()).optional()
});

// Schema for custom provider config
const CustomProviderSchema = z.object({
	npm: z.string().optional(),
	name: z.string().optional(),
	options: z
		.object({
			baseURL: z.string().optional(),
			apiKey: z.string().optional(),
			headers: z.record(z.string()).optional()
		})
		.optional(),
	models: z.record(z.string(), ModelConfigSchema).optional()
});

// Schema for the full OpenCode config (just the provider section)
const OpenCodeConfigSchema = z.object({
	provider: z.record(z.string(), CustomProviderSchema).optional()
});

export type CustomProviderConfig = z.infer<typeof CustomProviderSchema>;
export type OpenCodeConfig = z.infer<typeof OpenCodeConfigSchema>;

// Cache for loaded config
let cachedConfig: OpenCodeConfig | null = null;
let cachedCustomProviders: Map<string, ProviderFactory> | null = null;

/**
 * Get possible config file paths in order of priority
 */
function getConfigPaths(): string[] {
	const homedir = os.homedir();
	const cwd = process.cwd();

	return [
		// Project-level config (highest priority)
		path.join(cwd, 'opencode.json'),
		path.join(cwd, 'opencode.jsonc'),
		// Global config
		path.join(homedir, '.config', 'opencode', 'opencode.json'),
		path.join(homedir, '.config', 'opencode', 'opencode.jsonc'),
		// Windows alternative
		path.join(homedir, 'opencode.json'),
		path.join(homedir, 'opencode.jsonc')
	];
}

/**
 * Strip JSONC comments from content
 */
function stripJsonComments(content: string): string {
	// Remove single-line comments
	let result = content.replace(/\/\/.*$/gm, '');
	// Remove multi-line comments
	result = result.replace(/\/\*[\s\S]*?\*\//g, '');
	return result;
}

/**
 * Read and parse OpenCode config file
 */
async function readConfigFile(): Promise<OpenCodeConfig> {
	if (cachedConfig) {
		return cachedConfig;
	}

	const configPaths = getConfigPaths();

	for (const configPath of configPaths) {
		try {
			const file = Bun.file(configPath);
			if (await file.exists()) {
				let content = await file.text();

				// Handle JSONC (JSON with comments)
				if (configPath.endsWith('.jsonc')) {
					content = stripJsonComments(content);
				}

				const json = JSON.parse(content);
				const parsed = OpenCodeConfigSchema.safeParse(json);

				if (parsed.success) {
					cachedConfig = parsed.data;
					return cachedConfig;
				}
			}
		} catch {
			// Continue to next path
		}
	}

	// Return empty config if no file found
	cachedConfig = {};
	return cachedConfig;
}

/**
 * Create a provider factory for a custom provider
 */
function createCustomProviderFactory(config: CustomProviderConfig): ProviderFactory {
	// For now, we only support openai-compatible custom providers
	// This covers the vast majority of use cases
	return ((options?: ProviderOptions) => {
		const mergedOptions = {
			...config.options,
			...options,
			// Merge headers if both exist
			headers: {
				...config.options?.headers,
				...options?.headers
			}
		};

		// Use the configured name or fall back to 'custom'
		const providerName = config.name || 'custom';

		return createOpenAICompatible({
			name: providerName,
			baseURL: mergedOptions.baseURL || '',
			apiKey: mergedOptions.apiKey,
			headers: mergedOptions.headers
		});
	}) as ProviderFactory;
}

/**
 * Get all custom providers from OpenCode config
 */
export async function getCustomProviders(): Promise<Map<string, ProviderFactory>> {
	if (cachedCustomProviders) {
		return cachedCustomProviders;
	}

	const config = await readConfigFile();
	const providers = new Map<string, ProviderFactory>();

	if (config.provider) {
		for (const [providerId, providerConfig] of Object.entries(config.provider)) {
			// Only process providers that use openai-compatible or have a baseURL
			// Skip built-in providers that might be configured here
			if (
				providerConfig.npm === '@ai-sdk/openai-compatible' ||
				providerConfig.options?.baseURL
			) {
				providers.set(providerId, createCustomProviderFactory(providerConfig));
			}
		}
	}

	cachedCustomProviders = providers;
	return providers;
}

/**
 * Get a specific custom provider config
 */
export async function getCustomProviderConfig(
	providerId: string
): Promise<CustomProviderConfig | undefined> {
	const config = await readConfigFile();
	return config.provider?.[providerId];
}

/**
 * Check if a provider is a custom provider defined in OpenCode config
 */
export async function isCustomProvider(providerId: string): Promise<boolean> {
	const config = await readConfigFile();
	return providerId in (config.provider || {});
}

/**
 * Get the API key for a custom provider from its config
 */
export async function getCustomProviderApiKey(providerId: string): Promise<string | undefined> {
	const config = await getCustomProviderConfig(providerId);
	return config?.options?.apiKey;
}

/**
 * Clear the config cache (useful for testing or when config changes)
 */
export function clearConfigCache(): void {
	cachedConfig = null;
	cachedCustomProviders = null;
}
