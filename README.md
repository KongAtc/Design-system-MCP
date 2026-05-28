# Design System MCP

Thin Git-backed MCP adapter for a separate design-template repository.

The adapter reads React/TSX components, generated prop contracts, component metadata, and `tokens.json` from a design-template Git repo. It resolves `latest` at request time and stamps responses with the design-template repo commit SHA and commit date.

## Prerequisites

- Node.js 22+
- npm
- Codex CLI/Desktop with MCP support
- A design-template repo that contains:
  - `tokens.json`
  - `src/components/**/Component.tsx`
  - `src/components/**/Component.contract.json`
  - `src/components/**/Component.metadata.json`

## Quickstart

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

Verify the design-template repo:

```sh
cd ../stack-design-template
npm install
npm run check:contracts
npm run build
```

Add the MCP server to Codex:

```sh
cd ../design-system-mcp

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
command = "node"
args = ["/absolute/path/to/design-system-mcp/dist/src/index.js"]

[mcp_servers.stack-design-system.env]
DESIGN_SYSTEM_REPO = "/absolute/path/to/stack-design-template"
```

Restart Codex after editing the config.

## Configuration

By default, running from this folder reads `../design-template`. Override with:

```sh
DESIGN_SYSTEM_REPO=/path/to/design-template npm start
```

Use an absolute `DESIGN_SYSTEM_REPO` path in shared setup docs so users can place the template repo anywhere.

## Tools

- `search_components(intent, ref?)`
- `get_component(name, ref?)`
- `get_design_tokens(ref?)`
- `list_changes(since_ref)`
- `validate_usage(code, built_against)`

## Development

```sh
npm install
npm run build
npm start
```

## Provenance Workflow

When an agent builds a website with this MCP server, ask it to:

1. Call `get_design_tokens` or `get_component`.
2. Record the returned design-template SHA in `design-system.provenance.json`.
3. Generate the website using the returned components/tokens.
4. Call `validate_usage(code, built_against)` with that SHA.

Example provenance file:

```json
{
  "designSystem": "stack-design-system",
  "builtAgainst": "<SHA returned by MCP>",
  "notes": "Built using design-system-mcp and the Stack design template."
}
```
