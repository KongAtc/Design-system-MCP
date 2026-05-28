# Design System MCP

Thin Git-backed MCP adapter for a separate design-template repository.

By default, running from this folder reads `../design-template`. Override with:

```sh
DESIGN_SYSTEM_REPO=/path/to/design-template npm start
```

The adapter does not cache component content. It resolves `latest` at request time and stamps responses with the design-template repo commit SHA and commit date.

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
