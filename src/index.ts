import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Project } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs';  

// 1. Initialize the MCP Server
const server = new McpServer({
  name: 'context-reducer-server',
  version: '1.0.0',
});

// 2. Initialize the ts-morph AST parser
const project = new Project();

// 3. Register your custom tool with the CLI
server.tool(
  'read_file_skeleton',
  'Reads a TypeScript/JavaScript file and returns ONLY its structural skeleton (classes, methods, and exported functions) to save context window tokens.',
  {
    filePath: z.string().describe('The absolute or relative path to the file to analyze.'),
  },
  async ({ filePath }) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      
      // Safety check: Does the file exist?
      if (!fs.existsSync(absolutePath)) {
        return {
          content: [{ type: 'text', text: `Error: File not found at ${absolutePath}` }],
          isError: true,
        };
      }

      // REMINDER: Always use console.error for debugging in MCP! 
      console.error(`[Context Reducer] Analyzing file: ${absolutePath}`);

      const sourceFile = project.addSourceFileAtPath(absolutePath);
      let skeletonOutput = `--- SKELETON FOR: ${filePath} ---\n\n`;

      // Extract Classes and Methods
      const classes = sourceFile.getClasses();
      classes.forEach(cls => {
        // NEW: Check if the class is exported!
        const exportKeyword = cls.isExported() ? 'export ' : '';
        const defaultKeyword = cls.isDefaultExport() ? 'default ' : '';
        
        skeletonOutput += `${exportKeyword}${defaultKeyword}class ${cls.getName() || 'Anonymous'} {\n`;
        
        cls.getMethods().forEach(method => {
          const name = method.getName();
          const returnType = method.getReturnType().getText();
          const params = method.getParameters().map(p => 
              `${p.getName()}: ${p.getType().getText()}`
          ).join(", ");
          skeletonOutput += `  ${name}(${params}): ${returnType};\n`;
        });
        skeletonOutput += `}\n\n`;
      });

      // Extract Exported Functions (Crucial for modern Node/React codebases)
      const functions = sourceFile.getFunctions().filter(f => f.isExported());
      if (functions.length > 0) {
        skeletonOutput += `// Exported Functions\n`;
        functions.forEach(func => {
          const name = func.getName() || 'Anonymous';
          const returnType = func.getReturnType().getText();
          const params = func.getParameters().map(p => 
              `${p.getName()}: ${p.getType().getText()}`
          ).join(", ");
          skeletonOutput += `export function ${name}(${params}): ${returnType};\n`;
        });
        skeletonOutput += `\n`;
      }

      // Cleanup: Remove file from memory so the server doesn't crash on huge monorepos
      project.removeSourceFile(sourceFile);

      // Return the lightweight string back to Gemini
      return {
        content: [{ type: 'text', text: skeletonOutput }],
      };
      
    } catch (error) {
       console.error(`[Context Reducer] Error: ${String(error)}`);
       return {
           content: [{ type: 'text', text: `Error reading file: ${String(error)}` }],
           isError: true,
       };
    }
  },
);

// 4. Start the server and connect it to standard I/O
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Context Reducer MCP Server running! Ready to shrink some code.");
}

run().catch(error => {
    console.error("Fatal error starting server:", error);
    process.exit(1);
});