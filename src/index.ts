import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Project, Node } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs';  
import { execFileSync } from 'child_process';

// 1. Initialize the MCP Server
const server = new McpServer({
  name: 'context-reducer-server',
  version: '1.0.0',
});

// 2. Initialize the ts-morph AST parser
const project = new Project({ skipAddingFilesFromTsConfig: true });

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
      // const reductionMsg = '/* omitted */';
      //   const prune = (node: any) => {
      //       if (node.setBodyText) node.setBodyText(`\n    ${reductionMsg}\n`);
      //   };
      // // Extract Functions ,Classes and Methods, replacing their bodies with a placeholder message to indicate they were pruned.
      // sourceFile.getFunctions().forEach(prune);
      // sourceFile.getClasses().forEach(cls => {
      //   prune(cls);
      //   cls.getMethods().forEach(prune);
      // });
      // sourceFile.getExportedDeclarations().forEach((decls, name) => {
      //   decls.forEach(decl => {
      //     if (decl.getKindName() === 'FunctionDeclaration' || decl.getKindName() === 'MethodDeclaration' || decl.getKindName() === 'VariableDeclaration') prune(decl);
      //   });
      // });
      // sourceFile.getVariableDeclarations().forEach(decl => {
      //       const init = decl.getInitializer();
      //       if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      //           const body = (init as any).getBody();
      //           if (body && Node.isBlock(body)) (init as any).setBodyText(`\n    ${reductionMsg}\n`);
      //       }
      // });
      let skeleton = '';

      // 1. Extract Interfaces
      sourceFile.getInterfaces().forEach(iface => {
          const exportKw = iface.isExported() ? 'export ' : '';
          skeleton += `${exportKw}interface ${iface.getName()} {\n`;
          iface.getProperties().forEach(prop => {
              // getTypeNode() gets the raw text the dev wrote, avoiding type-checker bloat!
              const typeStr = prop.getTypeNode()?.getText() || 'any';
              skeleton += `  ${prop.getName()}: ${typeStr};\n`;
          });
          skeleton += `}\n\n`;
      });

      // 2. Extract Types (Type Aliases)
      sourceFile.getTypeAliases().forEach(typeAlias => {
          const exportKw = typeAlias.isExported() ? 'export ' : '';
          const typeStr = typeAlias.getTypeNode()?.getText() || 'any';
          skeleton += `${exportKw}type ${typeAlias.getName()} = ${typeStr};\n\n`;
      });

      // 3. Extract Classes & Methods
     // 3. Extract Classes, Properties, & Methods
      sourceFile.getClasses().forEach(cls => {
          const exportKw = cls.isExported() ? 'export ' : '';
          
          // Grab inheritance!
          const extendsClause = cls.getExtends() ? ` extends ${cls.getExtends()?.getText()}` : '';
          const implementsClause = cls.getImplements().length > 0 
              ? ` implements ${cls.getImplements().map(i => i.getText()).join(', ')}` 
              : '';

          skeleton += `${exportKw}class ${cls.getName() || 'Anonymous'}${extendsClause}${implementsClause} {\n`;
          
          // Grab class properties (variables inside the class)!
          cls.getProperties().forEach(prop => {
              const modifiers = prop.getModifiers().map(m => m.getText()).join(' ');
              const typeStr = prop.getTypeNode()?.getText() || 'any';
              skeleton += `  ${modifiers ? modifiers + ' ' : ''}${prop.getName()}: ${typeStr};\n`;
          });

          // Grab the methods!
          cls.getMethods().forEach(method => {
              const params = method.getParameters().map(p => p.getName()).join(', ');
              const returnType = method.getReturnTypeNode()?.getText() || 'any';
              skeleton += `  ${method.getName()}(${params}): ${returnType};\n`;
          });
          skeleton += `}\n\n`;
      });

      // 4. Extract Standalone Functions
      sourceFile.getFunctions().forEach(func => {
          const exportKw = func.isExported() ? 'export ' : '';
          const params = func.getParameters().map(p => p.getName()).join(', ');
          const returnType = func.getReturnTypeNode()?.getText() || 'any';
          skeleton += `${exportKw}function ${func.getName() || 'Anonymous'}(${params}): ${returnType};\n`;
      });
      if (sourceFile.getFunctions().length > 0) skeleton += '\n';

      // 5. Extract Variables & Arrow Functions
      sourceFile.getVariableStatements().forEach(varStmt => {
          const exportKw = varStmt.isExported() ? 'export ' : '';
          const declKind = varStmt.getDeclarationKind(); // 'const', 'let', or 'var'

          varStmt.getDeclarations().forEach(decl => {
              const init = decl.getInitializer();
              
              // Check if the variable is actually an arrow function!
              if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                  const params = (init as any).getParameters().map((p: any) => p.getName()).join(', ');
                  const returnType = (init as any).getReturnTypeNode()?.getText() || 'any';
                  skeleton += `${exportKw}${declKind} ${decl.getName()} = (${params}) => ${returnType};\n`;
              } 
              // Otherwise, if it's a standard exported constant, just grab its type
              else if (varStmt.isExported()) {
                  const typeStr = decl.getTypeNode()?.getText() || 'any';
                  skeleton += `${exportKw}${declKind} ${decl.getName()}: ${typeStr};\n`;
              }
          });
      });
        const imports = sourceFile.getImportDeclarations()
    .map(imp => {
        const mod = imp.getModuleSpecifierValue();
        const res = resolveImportPath(absolutePath, mod);
        return res ? `${mod} -> ${res}` : null;
    })
    .filter(Boolean)
    .join('\n');
      const output = sourceFile.getFullText();
      sourceFile.forget(); 
      
      // Pass 'imports' and 'skeleton' directly! No stringify, no full text!
      return { content: [{ type: 'text', text: `RESOLVED_IMPORTS:\n${imports}\n\nSKELETON:\n${skeleton}` }] };
  // return { content: [{ type: 'text', text: `RESOLVED_IMPORTS:\n${JSON.stringify(imports, null, 2)}\n\nSKELETON:\n${output}` }] };
  //   } catch (e: any) {
  //       return { content: [{ type: 'text', text: String(e), isError: true }] };
  //   }
    } catch (e: any) {
        return { content: [{ type: 'text', text: String(e), isError: true }] };
    }
});
function resolveImportPath(sourceFilePath: string, importPath: string): string | null {
    const extensions = ['.ts', '.tsx', '/index.ts'];
    const dir = path.dirname(sourceFilePath);
    let fullPath: string;

    if (importPath.startsWith('@rocket.chat/')) {
        const pkgName = importPath.split('/')[1]!;
        // Note: Some packages use 'src', others use 'server' or 'client'
        fullPath = path.resolve(process.cwd(), 'packages', pkgName);
    } else if (importPath.startsWith('meteor/')) {
        const meteorPkg = importPath.split('/')[1] || '';
        fullPath = path.resolve(process.cwd(), 'packages', meteorPkg);
    } else {
        fullPath = path.resolve(dir, importPath);
    }

    // Try various path resolutions
    const candidates = [
        fullPath,
        path.join(fullPath, 'src'),
        path.join(fullPath, 'lib')
    ];

    for (const base of candidates) {
        for (const ext of extensions) {
            const p = base.endsWith(ext) ? base : base + ext;
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}
    
server.tool('search_symbol', {
    query: z.string().describe('Symbol name to find (e.g., "sendMessage")')
}, async ({ query }) => {
    try {
        // Sanitize to prevent regex injection or shell escapes
        const sanitizedQuery = query.replace(/[^a-zA-Z0-9_.-]/g, '');
        const results = execFileSync('grep', ['-rl', '--include=*.ts', '--include=*.tsx', sanitizedQuery, '.'], {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024
        });
        const list = results.split('\n').filter(Boolean).slice(0, 10);
        return { content: [{ type: 'text', text: `Found in:\n${list.join('\n') || 'No matches.'}` }] };
    } catch (e: any) {
        if (e.status === 1) return { content: [{ type: 'text', text: "No matches found." }] };
        return { content: [{ type: 'text', text: `Search failed: ${e.message}`, isError: true }] };
    }
});

server.tool('read_symbol_details', {
    filePath: z.string(),
    symbolName: z.string()
}, async ({ filePath, symbolName }) => {
    try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(absolutePath)) {
        return {
          content: [{ type: 'text', text: `Error: File not found at ${absolutePath}` }],
          isError: true,
        };
      }
        const sourceFile = project.addSourceFileAtPath(absolutePath);
        let target: Node | undefined;

        if (symbolName.includes('.')) {
            const [className = '', methodName = ''] = symbolName.split('.');
            target = sourceFile.getClass(className)?.getMethod(methodName);
        } else {
            target = sourceFile.getFunction(symbolName) || 
                     sourceFile.getVariableDeclaration(symbolName) || 
                     sourceFile.getClass(symbolName);
        }

        const result = target ? target.getText(true) : `Symbol ${symbolName} not found.`;
        sourceFile.forget();
        return { content: [{ type: 'text', text: result }] };
    } catch (e: any) {
        return { content: [{ type: 'text', text: String(e), isError: true }] };
    }
});



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