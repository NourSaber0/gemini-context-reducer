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
// HELPER: Generates the zero-bloat skeleton for a single file
function getFileSkeleton(absolutePath: string) {
    const sourceFile = project.addSourceFileAtPath(absolutePath);
    let skeleton = '';
    const resolvedImports: { original: string, resolved: string }[] = [];

    // 1. Interfaces
    sourceFile.getInterfaces().forEach(iface => {
        skeleton += `${iface.isExported() ? 'export ' : ''}interface ${iface.getName()} {\n`;
        iface.getProperties().forEach(prop => {
            skeleton += `  ${prop.getName()}: ${prop.getTypeNode()?.getText() || 'any'};\n`;
        });
        skeleton += `}\n\n`;
    });

    // 2. Types
    sourceFile.getTypeAliases().forEach(typeAlias => {
        skeleton += `${typeAlias.isExported() ? 'export ' : ''}type ${typeAlias.getName()} = ${typeAlias.getTypeNode()?.getText() || 'any'};\n\n`;
    });

    // 3. Classes
    sourceFile.getClasses().forEach(cls => {
        const extendsClause = cls.getExtends() ? ` extends ${cls.getExtends()?.getText()}` : '';
        const implementsClause = cls.getImplements().length > 0 ? ` implements ${cls.getImplements().map(i => i.getText()).join(', ')}` : '';
        skeleton += `${cls.isExported() ? 'export ' : ''}class ${cls.getName() || 'Anonymous'}${extendsClause}${implementsClause} {\n`;
        cls.getProperties().forEach(prop => {
            const modifiers = prop.getModifiers().map(m => m.getText()).join(' ');
            skeleton += `  ${modifiers ? modifiers + ' ' : ''}${prop.getName()}: ${prop.getTypeNode()?.getText() || 'any'};\n`;
        });
        cls.getMethods().forEach(method => {
            const modifiers = method.getModifiers().map(m => m.getText()).join(' ');
            const params = method.getParameters().map(p => p.getText().replace(/\s+/g, ' ')).join(', ');
            skeleton += `  ${modifiers ? modifiers + ' ' : ''}${method.getName()}(${params}): ${method.getReturnTypeNode()?.getText() || 'any'};\n`;
        });
        skeleton += `}\n\n`;
    });

    // 4. Standalone Functions
    sourceFile.getFunctions().forEach(func => {
        const params = func.getParameters().map(p => p.getText().replace(/\s+/g, ' ')).join(', ');
        skeleton += `${func.isExported() ? 'export ' : ''}function ${func.getName() || 'Anonymous'}(${params}): ${func.getReturnTypeNode()?.getText() || 'any'};\n`;
    });

    // 5. Variables & Arrow Functions
    sourceFile.getVariableStatements().forEach(varStmt => {
        const exportKw = varStmt.isExported() ? 'export ' : '';
        const declKind = varStmt.getDeclarationKind();
        varStmt.getDeclarations().forEach(decl => {
            const init = decl.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                const params = (init as any).getParameters().map((p: any) => p.getText().replace(/\s+/g, ' ')).join(', ');
                skeleton += `${exportKw}${declKind} ${decl.getName()} = (${params}) => ${(init as any).getReturnTypeNode()?.getText() || 'any'};\n`;
            } else if (varStmt.isExported()) {
                skeleton += `${exportKw}${declKind} ${decl.getName()}: ${decl.getTypeNode()?.getText() || 'any'};\n`;
            }
        });
    });

    // 6. Object Literal Methods
    sourceFile.forEachDescendant(node => {
        if (Node.isMethodDeclaration(node) && Node.isObjectLiteralExpression(node.getParent())) {
            const params = node.getParameters().map(p => p.getText().replace(/\s+/g, ' ')).join(', ');
            skeleton += `  [Object Method] ${node.getName()}(${params}): ${node.getReturnTypeNode()?.getText() || 'any'};\n`;
        }
    });

    // 7. Map Imports
    sourceFile.getImportDeclarations().forEach(imp => {
        const mod = imp.getModuleSpecifierValue();
        const res = resolveImportPath(absolutePath, mod);
        if (res) resolvedImports.push({ original: mod, resolved: res });
    });

    sourceFile.forget();
    return { skeleton, resolvedImports };
}

server.tool('read_file_skeleton', {
    filePath: z.string().describe('The path to the file to analyze.')
}, async ({ filePath }) => {
    try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(absolutePath)) return { content: [{ type: 'text', text: `Error: File not found` }], isError: true };
        
        console.error(`[Context Reducer] Analyzing file: ${absolutePath}`);
        const { skeleton, resolvedImports } = getFileSkeleton(absolutePath);
        
        const importsStr = resolvedImports.map(i => `${i.original} -> ${i.resolved}`).join('\n');
        return { content: [{ type: 'text', text: `RESOLVED_IMPORTS:\n${importsStr}\n\nSKELETON:\n${skeleton}` }] };
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
        
        // UPGRADE: Changed -rl to -rn to get line numbers AND code snippets!
        const results = execFileSync('grep', ['-rn', '--include=*.ts', '--include=*.tsx', sanitizedQuery, '.'], {
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024
        });
        
        // Grab the top 15 results
        const list = results.split('\n').filter(Boolean).slice(0, 15);
        return { content: [{ type: 'text', text: `SMART SNIPPETS FOUND:\n${list.join('\n') || 'No matches.'}` }] };
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
server.tool('trace_feature_graph', {
    entryFilePath: z.string().describe('The starting file path to trace (e.g., "apps/meteor/server/services/push/service.ts")'),
    maxDepth: z.number().min(1).max(2).default(1).describe('How deep to trace dependencies (1 = entry file + its direct local imports)')
}, async ({ entryFilePath, maxDepth }) => {
    try {
        const absoluteEntryPath = path.resolve(process.cwd(), entryFilePath);
        if (!fs.existsSync(absoluteEntryPath)) return { content: [{ type: 'text', text: `Error: File not found` }], isError: true };

        const visited = new Set<string>();
        let graphOutput = '';

        function traverse(filePath: string, currentDepth: number, callerName: string) {
            if (currentDepth > maxDepth || visited.has(filePath)) return;
            visited.add(filePath);

            console.error(`[Context Reducer] Tracing Graph Node: ${filePath}`);
            const { skeleton, resolvedImports } = getFileSkeleton(filePath);
            
            const relPath = path.relative(process.cwd(), filePath);
            graphOutput += `\n=========================================\n`;
            graphOutput += `📄 FILE: ${relPath}\n`;
            graphOutput += `🔗 IMPORTED BY: ${callerName}\n`;
            graphOutput += `=========================================\n`;
            graphOutput += `${skeleton}\n`;

            // Only trace internal Rocket.Chat / Meteor files, ignore node_modules
            const localImports = resolvedImports.filter(i => !i.original.startsWith('node_modules') && !i.original.match(/^[a-z\-]+$/));
            
            localImports.forEach(imp => {
                traverse(imp.resolved, currentDepth + 1, relPath);
            });
        }

        traverse(absoluteEntryPath, 0, 'USER_PROMPT');

        return { content: [{ type: 'text', text: graphOutput }] };
    } catch (e: any) {
        return { content: [{ type: 'text', text: String(e), isError: true }] };
    }
});


async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Context Reducer MCP Server running! Ready to shrink some code.");
}

run().catch(error => {
    console.error("Fatal error starting server:", error);
    process.exit(1);
});