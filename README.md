# Rocket.Chat Code Analyzer: Agentic Context Reduction MCP

**Version:** 2.0.0 (Graph-RAG & Gatekeeper Update)  
**Architecture:** Model Context Protocol (MCP) Server

## ⚠️ The Problem: Monorepo Context Bloat
Most production codebases are stored in huge revision control repositories (similar to Rocket.Chat) and are often monorepos that combine the source code of a large number of related subprojects.

When AI agentic tooling is unleashed on these massive repositories, it quickly reveals the primitive and wasteful nature of early tools. LLM inferences are performed inside a loop where the context of the queries is constantly being built—and this context increases in size exponentially, query after query.

This means that repositories as large as Rocket.Chat are often out of reach (due to the token/AI-inference budget) for many open-source developers. Even though some AI service providers offer per-session caching and compression tools (like LLMLingua), these are generic $O(n)$ optimizations that have only a nominal impact on the overall project cost when large repositories are involved.

## 💡 The Solution: Domain-Specific Semantic Extraction & Routing
This project explores and implements a class of **"domain-specific context reduction mechanisms"** that have an exponential impact when working with large code repositories. These scoping mechanisms are specific to the domain of "code analysis/generation."

Instead of passing raw, unoptimized files to the LLM, this MCP server leverages Abstract Syntax Tree (AST) parsing via `ts-morph` to intelligently strip away implementation details while preserving the exact structural boundaries and type signatures the LLM needs to navigate the codebase.

By shifting the heavy lifting of code traversal from the LLM's context window to an independent MCP server, this tool enables exponential token savings, making full-repository analysis of the Rocket.Chat monorepo completely viable on a "free tier" inference budget.

---

## ⚙️ Core Mechanics & Tools
The server provides four highly optimized tools to the AI agent, allowing it to navigate the codebase progressively rather than swallowing it whole:

### 1. `read_file_skeleton` (The Micro-Map)
Instead of returning a 2,000-line file, this tool returns a condensed structural map of the file.
* **Domain-Specific Reduction:** It drops all function/method bodies, returning only exported Interfaces, Type Aliases, Class properties, Arrow Functions, and deeply nested Object Literal Methods (e.g., `Meteor.methods`).
* **Squashed Parameters:** It retains crucial TypeScript interfaces for context, but uses AST regex-squashing to compress multi-line object destructuring into dense, single-line signatures.
* **Why it matters:** An LLM rarely needs to see the internal `for-loop` of a utility function just to understand its API. This reduces file token payloads by up to 90%.

### 2. `trace_feature_graph` (The Macro-Map)
Answers the question: *"How does this feature work across the whole project?"*
* **Domain-Specific Reduction:** The agent provides an entry file. The tool automatically maps that file's `RESOLVED_IMPORTS`, recursively generating skeletons for all internal dependencies up to a specified depth.
* **Why it matters:** It provides a God's-eye view of an entire sub-system (e.g., Push Notifications) in a single tool call, chaining together models, services, and utilities without blind file-reading.

### 3. `search_symbol` (Smart Snippets)
Instead of asking the LLM to write complex find commands, this tool offloads the search to standard system `grep -rn`.
* **Domain-Specific Reduction:** Quickly scans `.ts` and `.tsx` files for a specific symbol (e.g., `MessageService`) and returns the file path, the exact line number, and a preview of the code line.
* **Why it matters:** Zero-token search. The LLM instantly gains semantic context without having to parse the contents of irrelevant directories.

### 4. `read_symbol_details` (The Drill-Down)
When the LLM identifies exactly which piece of code it needs to modify or analyze, it uses this tool.
* **Domain-Specific Reduction:** Extracts the full implementation code for *only* the specific requested symbol (e.g., `MessageService.sendMessage`), leaving the rest of the file behind.
* **Why it matters:** The LLM gets 100% of the relevant logic and 0% of the surrounding file noise.

---

## 🛡️ The Reasoning-Aware Gatekeeper (Gemini CLI Hooks)
A common failure point for AI agents is ignoring custom tools and attempting to read raw files natively, which instantly exhausts the context window. 

To solve this, this project implements a **PreToolUse Hook Policy Engine** (`gemini.config.js`). It acts as a strict reasoning gatekeeper:
* If the LLM attempts to use a token-heavy built-in tool (like `fs_read`), the Hook intercepts and **blocks** the action.
* It injects a deterministic prompt forcing the agent to route its logic through `trace_feature_graph` or `read_file_skeleton` instead.
* **The Result:** Guaranteed token protection and enforced Graph-RAG routing.

---

## 🧬 The Evolution of Context Reduction: Mutator vs. Generator
Early versions of this tool relied on a **"Mutator"** approach. The server would attempt to rewrite the existing file by replacing function bodies with `/* omitted */`. Modifying an existing string left behind a massive amount of "token bloat" (dead comments, whitespace, heavy formatting).

To achieve exponential context reduction, the architecture was rewritten to use a **"Generator"** approach. The server completely ignores the raw text, traverses the AST nodes, and generates a brand-new, ultra-lean string from scratch.

### 📊 Illustration: `messages/service.ts`
Let's look at how both approaches handle the exact same snippet of Rocket.Chat's `MessageService` class.

#### V1: The Mutator Approach (Legacy)
*Leaves behind original imports, unexported variables, heavy whitespace, and repetitive placeholders.*

```typescript
import { AppEvents, Apps } from '@rocket.chat/apps';
import type { IMessageService } from '@rocket.chat/core-services';
// ... (25 lines of raw imports) ...
const disableMarkdownParser = ['yes', 'true'].includes(String(process.env.DISABLE_MESSAGE_PARSER).toLowerCase());

export class MessageService extends ServiceClassInternal implements IMessageService {
	protected name = 'message';
	private preventMention: BeforeSavePreventMention;

	override async created() {
            /* omitted */
    }

	async saveMessageFromFederation({
		fromId,
		rid,
		federation_event_id,
		msg,
		e2e_content,
		file,
		files,
		attachments,
		thread,
		ts,
	}: {
		fromId: string;
		rid: string;
		// ... (15 more lines of inline types)
	}): Promise<IMessage> {
            /* omitted */
    }
}
```

#### V2: The Generator Approach (Current)
*Aggressively condensed. Raw imports are handled by the `RESOLVED_IMPORTS` block (not shown). Internal logic, dead comments, and whitespace are gone. Massive parameter types are squashed into single lines to preserve semantic value without the token bloat. Deeply nested object literals are successfully extracted.*

```typescript
export class MessageService extends ServiceClassInternal implements IMessageService {
  protected name: any;
  private preventMention: BeforeSavePreventMention;
  
  override async created(): any;
  
  // Notice the multi-line parameter destructuring is perfectly squashed to a single line
  async saveMessageFromFederation({ fromId, rid, federation_event_id, msg, e2e_content, file, files, attachments, thread, ts, }: { fromId: string; rid: string; federation_event_id: string; msg?: string; e2e_content?: { algorithm: 'm.megolm.v1.aes-sha2'; ciphertext: string; }; file?: IMessage['file']; files?: IMessage['files']; attachments?: IMessage['attachments']; thread?: { tmid: string; tshow: boolean }; ts: Date; }): Promise<IMessage>;
  
  async sendMessageWithValidation(user: IUser, message: Partial<IMessage>, room: Partial<IRoom>, upsert = false): Promise<IMessage>;
  async deleteMessage(user: IUser, message: IMessage): Promise<void>;
  
  // Successfully extracts nested methods from object literals (e.g., Meteor.methods)
  [Object Method] getMessages(messageIds): any;
  [Object Method] getUserAvatarURL(user?: string): string;
}
```

### 🔍 Output Example: Smart Snippets (`search_symbol`)
By upgrading from standard file discovery to line-specific extraction, the LLM receives immediate context:

```text
SMART SNIPPETS FOUND:
./packages/core-services/src/types/IMessageService.ts:3:export interface IMessageService {
./apps/meteor/server/services/messages/service.ts:32:export class MessageService extends ServiceClassInternal implements IMessageService {
./apps/meteor/server/services/startup.ts:55:	api.registerService(new MessageService());
```

## 🚀 Rocket.Chat Monorepo Integration
This tool features a custom `resolveImportPath` engine that understands Rocket.Chat's specific monorepo structure:

* **`@rocket.chat/*` Resolution:** Automatically maps imports to the correct `packages/<pkgName>` directory.
* **`meteor/*` Resolution:** Resolves legacy and current Meteor package imports.
* **Standard Resolution:** Intelligently checks `.ts`, `.tsx`, and `index.ts` paths to build a perfectly resolved import graph for the LLM.

## 🔄 Reusability & Upstream Potential
Because this solution is built on the standard Model Context Protocol (MCP), it is completely decoupled from the client.

* **Immediate Use:** It can be instantly connected to `gemini-cli` or any other MCP-compatible client.
* **Broad Utility:** While optimized for Rocket.Chat, the AST parsing logic works flawlessly on any TypeScript/JavaScript codebase.
* **Contribution:** This project is intended to be implemented in a reusable manner, allowing the contributor to eventually upstream the context-reduction mechanics back to the `gemini-cli` ecosystem.
