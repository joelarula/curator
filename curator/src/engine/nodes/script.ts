import * as vm from 'node:vm';
import type { NodeHandler } from './NodeHandler.js';
import type { CuratorScriptNode } from '../CuratorAst.js';
import { isCuratorAstNode } from '../CuratorAstValidation.js';
import { coffeeAstVerbs } from '../CoffeeVerbs.js';
import { logger } from '../../utils/logger.js';

export const scriptNode: NodeHandler<CuratorScriptNode> = {
  type: 'Curator_Script',
  async run(ast, req, ctx) {
    if (req.context?.spawnedChild) {
      // Phase 2: Child finished. Output is in req.context.input.
      const outputStr = typeof req.context.input === 'string' ? req.context.input : JSON.stringify(req.context.input || {});
      await ctx.saveResponse(req, outputStr);
      await ctx.completeRequest(req.id, 'COMPLETED');
      return;
    }

    logger.debug(`[CuratorRequestProcessor] Executing Script Node (${ast.language || 'javascript'}) for request ${req.id}`);
    const sandbox = {
      console,
      input: req.context?.input || '',
      context: req.context || {},
      ...coffeeAstVerbs,
    };
    const context = vm.createContext(sandbox);
    try {
      let codeToExecute = ast.code;
      if (ast.language === 'coffeescript') {
        const coffee = (await import('coffeescript')).default;
        codeToExecute = coffee.compile(ast.code, { bare: true, header: false });
      }
      const output = vm.runInContext(codeToExecute, context);
      
      if (isCuratorAstNode(output)) {
        logger.debug(`[CuratorRequestProcessor] Script generated a valid AST node of type ${output.type}. Spawning as child...`);
        await ctx.spawnChildAndParkParent(
          req,
          { ast: output, context: { ...req.context, spawnedChild: false, input: req.context?.input } },
          { spawnedChild: true }
        );
        return;
      }
      
      const result = typeof output === 'string' ? output : JSON.stringify(output);
      await ctx.saveResponse(req, result);
      await ctx.completeRequest(req.id, 'COMPLETED');
    } catch(e: any) {
      const result = `[Script Error] ${e.message}`;
      await ctx.saveResponse(req, result);
      await ctx.completeRequest(req.id, 'COMPLETED');
    }
  },
};
