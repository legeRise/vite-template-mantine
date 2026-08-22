Always start conversation with 786

## Python

Use `uv` for Python environments and packages: `uv venv venv` and `uv pip install ...`. Never use `python -m venv`, `python3 -m venv`, conda, or other package/environment managers unless explicitly requested.

## graphify

For ANY codebase question, if `graphify-out/graph.json` exists, ALWAYS run `graphify query "<question>"` FIRST. Do not search, grep, or read source files before the Graphify query.

Use `graphify path "<A>" "<B>"` for relationship questions and `graphify explain "<concept>"` for focused-concept questions.

If `graphify-out/wiki/index.md` exists, use it for broad navigation. Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not provide enough context.

Only read source files after the Graphify query when:
- modifying/debugging specific code,
- the graph lacks the needed detail, or
- the graph is missing or stale.

Type `/graphify` in Copilot Chat to build or update the graph.