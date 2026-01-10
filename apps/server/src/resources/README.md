# resources

yea ik putting a readme here is weird, but I want to keep notes to myself here so I can set these up right.

Resources are the most foundational building block of btca. They're the things agents can search through, and eventually modify. But that means that I need a fairly generic way to interact with them, with different implementations for different types of resources.

Resource types (in order of when I make them):

- git repos
- local directories
- npm packages
- my todo list (todoist)
- websites (probably with a browserbase instance to find stuff from pages)
- notion dbs
- obsidian vaults

_and so many more_

## interface

Resources need to have clear methods for loading them into context. The trick is for some resources they're easily modeled as files. For others, they're more complex and probably would work better as tool calls.

For example git repos are just files, those files should be in the agent's context. But a todo list, should probably have a "list all todos" tool call, and then eventually an "add todo" tool call, update todo, delete, mark as complete, etc.

So that means that resources should either be FS based or tool based. I like that distinction for now...

- `load` - an idempotent function that brings gets the resource ready to be used. for git repos this would be cloning or updating the repo. for a todo list this would be creating the client for calling the todoist api. I think "load" should create an "instance" of the resource (effect service)
-
