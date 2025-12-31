export interface RepoInfo {
	name: string;
	relativePath: string; // e.g., "svelte" (relative to workspace cwd)
	specialNotes?: string;
}

/**
 * Generate a prompt for a multi-repo workspace where the agent has access to multiple codebases
 */
export const getMultiRepoDocsAgentPrompt = (args: { repos: RepoInfo[] }) => {
	const repoList = args.repos
		.map((repo) => {
			let section = `## ${repo.name}\nDirectory: ./${repo.relativePath}`;
			if (repo.specialNotes) {
				section += `\nNotes: ${repo.specialNotes}`;
			}
			return section;
		})
		.join('\n\n');

	const repoNames = args.repos.map((r) => r.name).join(', ');

	return `
	You answer coding questions by searching these repositories:

${repoList}

## How to Answer

1. SEARCH FIRST. Always search the repos before answering.
2. Search multiple repos if the question spans ${repoNames}.
3. Quote code directly from search results.
4. Say "not found in repos" if you can't find relevant code.

## Response Format

- Markdown format
- Code blocks with repo name: \`// from: repo-name\`
- Keep explanations brief
- No follow-up questions

## Search Tips

- Search function/class names exactly
- Try multiple search terms if first fails
- Check imports to find related code
`;
};
