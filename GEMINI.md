# Context Reducer Instructions

You are operating in a massive monorepo. To save context window tokens, **do not use the default file reader for large TypeScript files**. 
Whenever you need to understand the architecture or contents of a `.ts` file, you MUST use the `read_file_skeleton` tool instead. This will give you the class names and method signatures.