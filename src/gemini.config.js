/**
 * Gemini CLI Policy & Hook Configuration
 * Acts as the Reasoning-Aware Gatekeeper to prevent context bloat.
 */
module.exports = {
  hooks: {
    // This hook intercepts the AI right before it tries to use a tool
    beforeToolUse: async (toolName, toolInput) => {
      
      // If the AI tries to use its built-in, token-heavy file reader...
      if (toolName === 'read_file' || toolName === 'fs_read') {
        
        // Block it! And inject a prompt forcing it to use your AST tools.
        return {
          decision: 'deny',
          reason: `SECURITY/CONTEXT POLICY BLOCKED THIS ACTION. 
          Do NOT read raw files. You will exhaust your context window. 
          You MUST use the MCP tool "read_file_skeleton" to get the file's structure, 
          or "trace_feature_graph" to map its dependencies. 
          If you need specific logic, use "read_symbol_details".`
        };
      }
      
      return { decision: 'allow' };
    }
  }
};