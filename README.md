# Gemini CLI: AST Context Reducer (MCP Server) 🚀

A Model Context Protocol (MCP) server designed to solve token bloat and context exhaustion when using AI agents on large, highly relational monorepos like Rocket.Chat.

## The Problem: Context Window Bloat
When the `gemini-cli` reads a massive file (e.g., a core service), it injects the entire raw text into the LLM's context window. For large repositories, this leads to:
1. Rapidly exhausting the free-tier API token budget.
2. Slower inference times.
3. "Lost in the Middle" hallucinations as the agent struggles to find the architecture hidden within thousands of lines of implementation logic.

## The Solution: Domain-Specific Graph Retrieval
Instead of generic file-reading, this tool intercepts requests and uses `ts-morph` to parse the Abstract Syntax Tree (AST) of TypeScript/JavaScript files. 

It performs two critical domain-specific optimizations:
1. **Dependency Mapping (Edges):** Extracts `import` statements to map exactly what the file depends on, acting as a dynamic Graph-RAG router.
2. **Structural Skeletons (Nodes):** Strips away internal implementation details and returns only class definitions, method signatures, and exported functions.

### 📊 Benchmark (`messages/service.ts` in Rocket.Chat)
* **Standard Read:** 339 lines (~2,760 tokens)
* **AST Skeleton Tool:** 22 lines (~200 tokens)
* **Net Impact:** A **93% reduction** in context payload.

## Example Output
When the Gemini agent calls `read_file_skeleton` on a service, it receives a highly optimized map:

```text
--- DEPENDENCY GRAPH (IMPORTS) ---
depends_on: "@rocket.chat/models"
depends_on: "../../../app/lib/server/functions/sendMessage"
depends_on: "../../../app/lib/server/functions/updateMessage"

--- STRUCTURAL SKELETON ---
export class MessageService {
  created(): Promise<void>;
  sendMessage({ fromId, rid, msg }: { fromId: string; rid: string; msg: string; }): Promise<IMessage>;
  deleteMessage(user: IUser, message: IMessage): Promise<void>;
  // ...
}
*(Instructions on how to run `npm run build` and `gemini extensions link .`)*
