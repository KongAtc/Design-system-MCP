# Design System MCP

Thin Git-backed MCP adapter for a separate design-template repository.

The adapter reads React/TSX components, generated prop contracts, component metadata, and `tokens.json` from a design-template Git repo. It resolves `latest` at request time and stamps responses with the design-template repo commit SHA and commit date.

## Prerequisites

- Node.js 22+
- npm
- Codex CLI/Desktop with MCP support
- Git available on `PATH`
- A design-template repo that contains:
  - `tokens.json`
  - `src/components/**/Component.tsx`
  - `src/components/**/Component.contract.json`
  - `src/components/**/Component.metadata.json`

## Quickstart

### Option A: Use The Published Package

After this package is published to npm, users only need this MCP package name and the design-template repo URL. The MCP server will clone the template into a local cache automatically.

Add the MCP server to Codex using `npx`:

```sh
codex mcp add stack-design-system \
  --env DESIGN_SYSTEM_REPO_URL="<YOUR_TEMPLATE_REPO_URL>" \
  -- npx -y <YOUR_NPM_PACKAGE_NAME>
```

When the MCP server starts, it clones the template repo into:

```txt
~/.cache/design-system-mcp/
```

Override the cache path when needed:

```sh
codex mcp add stack-design-system \
  --env DESIGN_SYSTEM_REPO_URL="<YOUR_TEMPLATE_REPO_URL>" \
  --env DESIGN_SYSTEM_REPO_CACHE="/absolute/path/to/cache/stack-design-template" \
  -- npx -y <YOUR_NPM_PACKAGE_NAME>
```

By default, `latest` resolves to the remote repository's default branch via `origin/HEAD`. Set `DESIGN_SYSTEM_REPO_REF` only when you want a specific branch, tag, or SHA:

```sh
--env DESIGN_SYSTEM_REPO_REF="main"
```

For private repos, use an SSH URL or a Git credential helper that works in the user's shell before registering the MCP server.

If you publish this package under its current name, replace `<YOUR_NPM_PACKAGE_NAME>` with:

```txt
design-system-mcp
```

### Option B: Use A Local Template Checkout

Use this if you want to inspect or edit the template locally.

```sh
mkdir stack-design-system
cd stack-design-system

git clone <YOUR_TEMPLATE_REPO_URL> stack-design-template
```

Verify the design-template repo:

```sh
cd stack-design-template
npm install
npm run check:contracts
npm run build
```

Add the published MCP server to Codex with the local template path:

```sh
codex mcp add stack-design-system \
  --env DESIGN_SYSTEM_REPO="$(pwd)" \
  -- npx -y <YOUR_NPM_PACKAGE_NAME>
```

### Option C: Develop This MCP Locally

Clone this MCP repo and your design-template repo side by side:

```sh
mkdir stack-design-system
cd stack-design-system

git clone <YOUR_MCP_REPO_URL> design-system-mcp
git clone <YOUR_TEMPLATE_REPO_URL> stack-design-template
```

Install and build the MCP server:

```sh
cd design-system-mcp
npm install
npm run build
```

Register the local build with Codex:

```sh
DESIGN_SYSTEM_REPO="$(cd ../stack-design-template && pwd)"
MCP_SERVER="$(pwd)/dist/src/index.js"

codex mcp add stack-design-system \
  --env DESIGN_SYSTEM_REPO="$DESIGN_SYSTEM_REPO" \
  -- node "$MCP_SERVER"
```

Verify the registration:

```sh
codex mcp list
```

Restart Codex or open a new Codex session, then test with:

```txt
Use stack-design-system to search components for "team lunch mobile template".
```

```txt
Use stack-design-system to get_component StackTeamLunchTemplate.
```

```txt
Use stack-design-system to get_design_tokens.
```

## Manual Codex Config

You can also edit `~/.codex/config.toml` directly:

```toml
[mcp_servers.stack-design-system]
command = "npx"
args = ["-y", "<YOUR_NPM_PACKAGE_NAME>"]

[mcp_servers.stack-design-system.env]
DESIGN_SYSTEM_REPO_URL = "https://github.com/your-org/stack-design-template.git"
```

For a local template checkout:

```toml
[mcp_servers.stack-design-system]
command = "npx"
args = ["-y", "<YOUR_NPM_PACKAGE_NAME>"]

[mcp_servers.stack-design-system.env]
DESIGN_SYSTEM_REPO = "/absolute/path/to/stack-design-template"
```

For local MCP development without npm publishing:

```toml
[mcp_servers.stack-design-system]
command = "node"
args = ["/absolute/path/to/design-system-mcp/dist/src/index.js"]

[mcp_servers.stack-design-system.env]
DESIGN_SYSTEM_REPO = "/absolute/path/to/stack-design-template"
```

Restart Codex after editing the config.

## Configuration

The server supports three repo source modes:

- `DESIGN_SYSTEM_REPO_URL`: Git URL to auto-clone and fetch into a local cache.
- `DESIGN_SYSTEM_REPO`: local template repo path.
- default: `../design-template` relative to the MCP process.

Remote URL mode:

```sh
DESIGN_SYSTEM_REPO_URL=https://github.com/your-org/stack-design-template.git \
npm start
```

Local checkout mode:

```sh
DESIGN_SYSTEM_REPO=/path/to/design-template npm start
```

Optional cache override:

```sh
DESIGN_SYSTEM_REPO_CACHE=/path/to/cache npm start
```

Use absolute paths in shared setup docs so users can place repos and caches anywhere.

## Tools

- `search_components(intent, ref?)`
- `get_component(name, ref?)`
- `get_design_tokens(ref?)`
- `get_provenance_template(designSystem?, ref?, notes?)`
- `list_changes(since_ref)`
- `validate_usage(code, built_against)`

## Development

```sh
npm install
npm run build
npm start
```

## Packaging

Before publishing, choose the final package name in `package.json`. The current placeholder name is:

```txt
design-system-mcp
```

Check what will be published:

```sh
npm run pack:dry-run
```

Publish to npm:

```sh
npm publish
```

For a scoped public package, use:

```sh
npm publish --access public
```

After publish, users can run the MCP server with:

```sh
npx -y <YOUR_NPM_PACKAGE_NAME>
```

## Provenance Workflow

When an agent builds a website with this MCP server, ask it to:

1. Call `get_design_tokens`, `get_component`, or `get_provenance_template`.
2. Record the returned design-template SHA in `design-system.provenance.json`.
3. Generate the website using the returned components/tokens.
4. Call `validate_usage(code, built_against)` with that SHA.

Recommended prompt:

```txt
Use stack-design-system to call get_provenance_template.
Create design-system.provenance.json from the returned payload.
After implementation, run validate_usage with provenance.builtAgainst.
```

Example provenance file:

```json
{
  "designSystem": "stack-design-system",
  "builtAgainst": "<SHA returned by MCP>",
  "notes": "Built using design-system-mcp and the Stack design template."
}
```
