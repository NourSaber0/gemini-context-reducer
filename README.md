# Gemini CLI: AST Context Reducer (MCP Server) 🚀

A Model Context Protocol (MCP) server designed to solve token bloat and context exhaustion when using AI agents on large monorepos like Rocket.Chat.

## The Problem: Context Window Bloat
When the `gemini-cli` reads a massive file (e.g., a core service or complex class), it injects the entire raw text into the LLM's context window. For large repositories, this leads to:
1. Rapidly exhausting the free-tier API token budget.
2. Slower inference times.
3. "Lost in the Middle" hallucinations as the agent struggles to find the architecture hidden within thousands of lines of implementation logic.

## The Solution: Domain-Specific Context Reduction
Instead of generic file-reading, this tool intercepts requests and uses `ts-morph` to parse the Abstract Syntax Tree (AST) of TypeScript/JavaScript files. It strips away the internal implementation details and returns a clean, structural skeleton.

### 📊 Benchmark (`messages/service.ts` in Rocket.Chat)
* **Standard Read:** 339 lines (~2,760 tokens)
* **AST Skeleton Tool:** 22 lines (~200 tokens)
* **Net Impact:** A **93% reduction** in context payload.

## Core Features (MVP)
* `read_file_skeleton`: Returns class definitions, method signatures (with parameters/return types), and exported functions.
* `read_specific_implementation`: (In Progress) Allows the agent to fetch the raw code of a single, specific function on-demand after viewing the skeleton.

## Next Steps (Phase 2): Graph Retrieval Layer
Currently, agents read files in isolation. The next phase of this project will extend the AST parser to extract `import`/`export` edges, dynamically building a local Knowledge Graph. 

When the agent requests a file skeleton, the server will also return its immediate dependency graph, transforming the context reducer into an intelligent graph-router that drastically reduces the number of blind file-reads required to understand system architecture.

## Installation & Usage
*(Instructions on how to run `npm run build` and `gemini extensions link .`)*
