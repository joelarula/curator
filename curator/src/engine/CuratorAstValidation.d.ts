import type { CuratorAstNode } from './CuratorAst.js';
export declare const CURRENT_AST_VERSION: 1;
export declare const AST_LIMITS: {
    readonly maxDepth: 32;
    readonly maxNodes: 1000;
    readonly maxLoopIterations: 1000;
    readonly maxSerializedBytes: number;
};
export interface AstValidationResult {
    valid: boolean;
    errors: string[];
    node?: CuratorAstNode;
}
export declare function isCuratorAstNode(value: unknown): value is CuratorAstNode;
export declare function validateCuratorAst(value: unknown): AstValidationResult;
export declare function assertValidCuratorAst(value: unknown): asserts value is CuratorAstNode;
export declare function withCurrentAstVersion(value: CuratorAstNode): CuratorAstNode;
//# sourceMappingURL=CuratorAstValidation.d.ts.map