# Gemini CLI: AST Context Reducer (MCP Server) 🚀

A Model Context Protocol (MCP) server designed to solve token bloat and context exhaustion when using AI agents on large, highly relational monorepos like Rocket.Chat.

## ⚠️ The Problem: Context Window Bloat
When the `gemini-cli` reads a massive file (e.g., a core service), it injects the entire raw text into the LLM's context window. For large enterprise repositories, this leads to:
* Rapidly exhausting the API token budget.
* Slower inference times and rate-limiting.
* "Lost in the Middle" hallucinations as the agent struggles to find the core architecture hidden within thousands of lines of implementation logic, whitespace, and JSDoc comments.

## 💡 The Solution: Domain-Specific Graph Retrieval & Zero-Bloat Parsing
Instead of generic file-reading, this tool intercepts requests and uses `ts-morph` to parse the Abstract Syntax Tree (AST) of TypeScript/JavaScript files. 

It treats the monorepo as a Knowledge Graph, performing two critical domain-specific optimizations:
1.  **Dependency Mapping (Edges):** Extracts `import` statements and resolves their absolute paths (including custom `@rocket.chat/` and `meteor/` workspace routing), acting as a dynamic Graph-RAG router.
2.  **Structural Skeletons (Nodes):** Reconstructs the file architecture from scratch. It perfectly extracts Classes, Methods (with modifiers), Interfaces, Types, Standalone Functions, and Arrow Functions (`export const foo = () => {}`) while stripping away 100% of the useless token bloat.

## 🛠️ Included Tools
1.  **`read_file_skeleton`**: Reads a file and returns only the resolved dependency graph and the zero-bloat structural map.
2.  **`read_symbol_details`**: A dedicated drill-down tool. Allows the agent to fetch the specific, full implementation logic of a method, class, or function on-demand after reading the skeleton.
3.  **`search_symbol`**: A lightweight `grep`-based global search to help the agent quickly locate where specific symbols live across the entire monorepo.

## 📊 Real-World Benchmark
Tested on `apps/meteor/server/services/messages/service.ts` in the Rocket.Chat monorepo.

* **Standard File Read:** 11,053 characters (~2,760 tokens)
* **AST Graph & Skeleton Tool:** 4,206 characters (~1,050 tokens)
* **Net Impact:** A **~62% reduction** in context payload.
* **Added Value:** Traded useless implementation bloat and JSDoc comments for highly-structured dependency resolution paths (`RESOLVED_IMPORTS`), empowering the LLM to traverse the codebase without token exhaustion.

## 🔍 How It Works:
To prevent LLM context exhaustion, 

* **The Zero-Bloat Generator:** Instead of mutating the original file, our tool completely ignores the raw text. It traverses the AST to map the structural nodes and dynamically generates a brand-new, ultra-lean skeleton string from scratch.

### Example Output
When the Gemini agent calls `read_file_skeleton` on a service, it receives a highly optimized map:

```typescript
RESOLVED_IMPORTS:
../utils/validation -> /absolute/path/to/validation.ts

SKELETON:
export interface Session {
  token: string;
}

export class AuthService extends ServiceClassInternal {
  private cache: any;
  async login(userId, token): Promise<Session>;
}

export const formatName = (first, last) => string;
