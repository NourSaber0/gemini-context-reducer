# Rocket.Chat Code Analyzer: Agentic Context Reduction MCP

**Version:** 1.0.0  
**Architecture:** Model Context Protocol (MCP) Server

## The Problem: Monorepo Context Bloat
Most production codebases are stored in huge revision control repositories (similar to Rocket.Chat) and are often monorepos that combine the source code of a large number of related subprojects.

When AI agentic tooling is unleashed on these massive repositories, it quickly reveals the primitive and wasteful nature of early tools. LLM inferences are performed inside a loop where the context of the queries is constantly being built—and this context increases in size exponentially, query after query. 

This means that repositories as large as Rocket.Chat are often out of reach (due to the token/AI-inference budget) for many open-source developers. Even though some AI service providers offer per-session caching and compression tools (like LLMLingua), these are generic $O(n)$ optimizations that have only a nominal impact on the overall project cost when large repositories are involved.

## The Solution: Domain-Specific Semantic Skeleton Extraction
This project explores and implements a class of **"domain-specific context reduction mechanisms"** that have an exponential impact when working with large code repositories. These scoping mechanisms are specific to the domain of "code analysis/generation."



Instead of passing raw, unoptimized files to the LLM, this MCP server leverages Abstract Syntax Tree (AST) parsing via `ts-morph` to intelligently strip away implementation details while preserving the exact structural boundaries the LLM needs to navigate the codebase.

By shifting the heavy lifting of code traversal from the LLM's context window to an independent MCP server, this tool enables exponential token savings, making full-repository analysis of the Rocket.Chat monorepo completely viable on a "free tier" inference budget.


## ⚙️ Core Mechanics & Tools

The server provides three highly optimized tools to the AI agent, allowing it to navigate the codebase progressively rather than swallowing it whole:

### 1. `read_file_skeleton` 
Instead of returning a 2,000-line file, this tool returns a condensed structural map of the file.
* **Domain-Specific Reduction:** It drops all function/method bodies, returning only exported Interfaces, Type Aliases, Class properties/signatures, and Arrow Function signatures.
* **Why it matters:** An LLM rarely needs to see the internal `for`-loop of a utility function just to understand how to interact with its API. This reduces file token payloads by up to 90%, allowing the agent to map out the repository architecture without bloating the context loop.

### 2. `search_symbol`
Instead of asking the LLM to write complex find commands or ingest multiple files to locate a definition, this tool offloads the search to standard system `grep`.
* **Domain-Specific Reduction:** Quickly scans `.ts` and `.tsx` files for a specific symbol (e.g., `sendMessage`) and returns up to 10 file paths. 
* **Why it matters:** Zero-token search. The LLM instantly knows *where* to look without having to parse the contents of irrelevant directories.

### 3. `read_symbol_details` 
When the LLM identifies exactly which piece of code it needs to modify or analyze, it uses this tool.
* **Domain-Specific Reduction:** Extracts the full implementation code for *only* the specific requested symbol (e.g., `ChatService.sendMessage`), leaving the rest of the file behind.
* **Why it matters:** The LLM gets 100% of the relevant logic and 0% of the surrounding file noise.

## 🧬 The Evolution of Context Reduction: Mutator vs. Generator

Early versions of this tool relied on a **"Mutator" approach**. The server would take the raw file string, parse it, and attempt to rewrite the existing file by replacing function bodies with `/* omitted */`. 

While this saved tokens, it quickly became apparent that LLMs read *every single character*. Modifying an existing string leaves behind a massive amount of "token bloat." To achieve exponential context reduction, the architecture was rewritten to use a **"Generator" approach**. Instead of modifying the old file, the server now traverses the AST and generates a brand-new, ultra-lean string from scratch.

Here are the exact categories of "token bloat" the Generator approach actively strips out of files, and why it saves so much space:

1. **Massive Blocks of Dead/Commented Code**
   * *The Problem:* In the Mutator approach, `ts-morph` preserves giant blocks of commented-out code because they are part of the file's raw text. LLMs process every character, wasting hundreds of tokens on dead logic.
   * *The Fix:* The Generator ignores comments completely.
2. **Unexported Internal Boilerplate**
   * *The Problem:* Files often have internal configuration variables that are only used locally and don't define the architecture (e.g., `const disableMarkdownParser = ...`).
   * *The Fix:* Because the Generator explicitly looks for `.isExported()` or class properties, it ignores isolated, internal constants. If the LLM needs to know how a specific parser is configured, it uses `read_symbol_details`.
3. **The `/* omitted */` Placeholders**
   * *The Problem:* In a file with 30 methods, printing `/* omitted */` (along with newlines and indentation) wastes about 15-20 characters per method. 
   * *The Fix:* The Generator simply prints `deleteMessage(...): Promise<void>;`, which mathematically implies the logic is hidden without wasting a single extra character.
4. **Excessive Whitespace and Formatting**
   * *The Problem:* In standard text, spaces, tabs, and `\n` (newlines) count as tokens. A file with hundreds of empty lines wastes tokens on literal empty space. 
   * *The Fix:* By building the string from scratch, the Generator controls the exact formatting, ensuring there is only ever exactly one newline where needed.


### 📊 Illustration: `messages/service.ts`

To see this in action, let's look at how both approaches handle the exact same snippet of Rocket.Chat's `MessageService` class. 

#### V1: The Mutator Approach (Legacy)
Notice how the legacy approach leaves behind original imports, unexported variables, heavy whitespace, and repetitive placeholders.

```typescript
import { AppEvents, Apps } from '@rocket.chat/apps';
import type { IMessageService } from '@rocket.chat/core-services';
// ... (25 lines of raw imports) ...
import { BeforeSaveSpotify } from './hooks/BeforeSaveSpotify';

const disableMarkdownParser = ['yes', 'true'].includes(String(process.env.DISABLE_MESSAGE_PARSER).toLowerCase());

export class MessageService extends ServiceClassInternal implements IMessageService {
	protected name = 'message';

	private preventMention: BeforeSavePreventMention;

	private badWords: BeforeSaveBadWords;

	private spotify: BeforeSaveSpotify;

	private jumpToMessage: BeforeSaveJumpToMessage;

	private cannedResponse: BeforeSaveCannedResponse;

	private markdownParser: BeforeSaveMarkdownParser;

	private checkMAC: BeforeSaveCheckMAC;

	override async created() {

            /* omitted */
    }

	private async configureBadWords() {

            /* omitted */
    }

	async sendMessage({ fromId, rid, msg }: { fromId: string; rid: string; msg: string }): Promise<IMessage> {

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
		federation_event_id: string;
		msg?: string;
		e2e_content?: {
			algorithm: 'm.megolm.v1.aes-sha2';
			ciphertext: string;
		};
		file?: IMessage['file'];
		files?: IMessage['files'];
		attachments?: IMessage['attachments'];
		thread?: { tmid: string; tshow: boolean };
		ts: Date;
	}): Promise<IMessage> {

            /* omitted */
    }

	async sendMessageWithValidation(user: IUser, message: Partial<IMessage>, room: Partial<IRoom>, upsert = false): Promise<IMessage> {

            /* omitted */
    }

	async deleteMessage(user: IUser, message: IMessage): Promise<void> {

            /* omitted */
    }

	async updateMessage(message: IMessage, user: IUser, originalMsg?: IMessage, previewUrls?: string[]): Promise<void> {

            /* omitted */
    }

	async reactToMessage(userId: string, reaction: string, messageId: IMessage['_id'], shouldReact?: boolean): Promise<void> {

            /* omitted */
    }

	async saveSystemMessageAndNotifyUser<T = IMessage>(
		type: MessageTypesValues,
		rid: string,
		messageText: string,
		owner: Pick<IUser, '_id' | 'username' | 'name'>,
		extraData?: Partial<T>,
	): Promise<IMessage> {

            /* omitted */
    }

	async saveSystemMessage<T = IMessage>(
		type: MessageTypesValues,
		rid: string,
		message: string,
		owner: Pick<IUser, '_id' | 'username' | 'name'>,
		extraData?: Partial<T>,
	): Promise<IMessage> {

            /* omitted */
    }

	async beforeSave({
		message,
		room,
		user,
		previewUrls,
		parseUrls = true,
	}: {
		message: IMessage;
		room: IRoom;
		user: Pick<IUser, '_id' | 'username' | 'name' | 'emails' | 'language'>;
		previewUrls?: string[];
		parseUrls?: boolean;
	}): Promise<IMessage> {

            /* omitted */
    }

	// The actions made on this event should be asynchronous
	// That means, caller should not expect to receive updated message
	// after calling
	async afterSave({ message }: { message: IMessage }): Promise<void> {

            /* omitted */
    }

```

#### V2: The Generator Approach (Current)

Notice how aggressively condensed this output is. Raw imports are stripped entirely (handled independently by the `RESOLVED_IMPORTS` block not shown here), internal logic and comments are gone, and strict structural boundaries are enforced.

```typescript
export class MessageService extends ServiceClassInternal implements IMessageService {
  protected name: any;
  private preventMention: BeforeSavePreventMention;
  private badWords: BeforeSaveBadWords;
  private spotify: BeforeSaveSpotify;
  private jumpToMessage: BeforeSaveJumpToMessage;
  private cannedResponse: BeforeSaveCannedResponse;
  private markdownParser: BeforeSaveMarkdownParser;
  private checkMAC: BeforeSaveCheckMAC;
  created(): any;
  configureBadWords(): any;
  sendMessage({ fromId, rid, msg }): Promise<IMessage>;
  saveMessageFromFederation({
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
	}): Promise<IMessage>;
  sendMessageWithValidation(user, message, room, upsert): Promise<IMessage>;
  deleteMessage(user, message): Promise<void>;
  updateMessage(message, user, originalMsg, previewUrls): Promise<void>;
  reactToMessage(userId, reaction, messageId, shouldReact): Promise<void>;
  saveSystemMessageAndNotifyUser(type, rid, messageText, owner, extraData): Promise<IMessage>;
  saveSystemMessage(type, rid, message, owner, extraData): Promise<IMessage>;
  beforeSave({
		message,
		room,
		user,
		previewUrls,
		parseUrls = true,
	}): Promise<IMessage>;
  afterSave({ message }): Promise<void>;
}

```

## 🚀 Rocket.Chat Monorepo Integration

This tool is explicitly designed to handle the complex architectures found in large Node/Meteor applications. It features a custom `resolveImportPath` engine that understands Rocket.Chat's specific monorepo structure:

* **`@rocket.chat/*` Resolution:** Automatically maps imports to the correct `packages/<pkgName>` directory.
* **`meteor/*` Resolution:** Resolves legacy and current Meteor package imports.
* **Standard Resolution:** Intelligently checks `.ts`, `.tsx`, and `index.ts` paths to build a perfectly resolved import graph for the LLM.

## 🔄 Reusability & Upstream Potential

Because this solution is built on the standard **Model Context Protocol (MCP)**, it is completely decoupled from the client.

* **Immediate Use:** It can be instantly connected to `gemini-cli` or any other MCP-compatible client.
* **Broad Utility:** While optimized for Rocket.Chat, the AST parsing logic works flawlessly on *any* TypeScript/JavaScript codebase.
* **Contribution:** This project is intended to be implemented in a reusable manner, allowing the contributor to eventually upstream the context-reduction mechanics back to the `gemini-cli` ecosystem.


## 📚 References & Open Source Context

This project was built to solve the practical challenge of analyzing massive, real-world open-source monorepos on a reasonable AI inference budget.

* **The Target Repository:** [Rocket.Chat GitHub Repository](https://github.com/RocketChat/Rocket.Chat)
* **The Code Example:** The snippets used in the "Evolution" section above are derived from Rocket.Chat's internal message handling logic. You can view the original, unpruned source file here: [`apps/meteor/server/services/messages/service.ts`](https://www.google.com/search?q=https://github.com/RocketChat/Rocket.Chat/blob/master/apps/meteor/server/services/messages/service.ts)
