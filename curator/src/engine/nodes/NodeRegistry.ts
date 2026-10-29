import type { NodeHandler } from './NodeHandler.js';
import { CuratorNodeType } from '../CuratorAst.js';
import { registerAstExtensionType, unregisterAstExtensionType } from '../CuratorAstValidation.js';

const BUILTIN_PREFIX = 'Curator_';
const BUILTIN_TYPES = new Set<string>(Object.values(CuratorNodeType));

/** Maps AST node types to handlers. Plugin types are also registered with AST validation. */
export class NodeRegistry {
  private handlers = new Map<string, NodeHandler>();

  /**
   * Registers a handler. Replacing an existing type requires `override` (e.g. swapping a built-in in tests).
   * Plugin (non-'Curator_') types become valid AST nodes anywhere in a workflow; their fields are checked by `validate`.
   */
  register(handler: NodeHandler, opts: { override?: boolean } = {}): this {
    if (!handler?.type || typeof handler.run !== 'function') throw new Error('Node handler needs a type and a run function');
    if (handler.type.startsWith(BUILTIN_PREFIX) && !BUILTIN_TYPES.has(handler.type)) throw new Error(`'${handler.type}' uses the reserved 'Curator_' prefix`);
    if (this.handlers.has(handler.type) && !opts.override) throw new Error(`Node handler for '${handler.type}' is already registered`);
    if (!handler.type.startsWith(BUILTIN_PREFIX)) registerAstExtensionType(handler.type, handler.validate);
    this.handlers.set(handler.type, handler);
    return this;
  }

  unregister(type: string): boolean {
    if (!type.startsWith(BUILTIN_PREFIX)) unregisterAstExtensionType(type);
    return this.handlers.delete(type);
  }

  get(type: string): NodeHandler | undefined {
    return this.handlers.get(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}
