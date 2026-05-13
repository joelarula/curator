import type { PrismaClient } from '@prisma/client';

export async function evaluateCondition(
    args: { expression?: string; evalFn?: string; data?: any },
    _prisma: PrismaClient,
    _userId: string
) {
    const { expression, evalFn, data } = args;
    
    if (!expression && !evalFn) {
        throw new Error('evaluate_condition requires an "expression" or "evalFn" argument');
    }

    try {
        let result;
        if (evalFn) {
            // evalFn is a stringified closure like "(data) => data.foo === true"
            // We construct a function that returns the result of invoking this closure
            const fn = new Function('data', `return (${evalFn})(data);`);
            result = fn(data);
        } else {
            const fn = new Function('data', `return ${expression};`);
            result = fn(data);
        }

        return {
            success: true,
            data: {
                result: !!result,
                rawValue: result
            }
        };
    } catch (err: any) {
        console.error('[evaluate_condition] Error evaluating expression:', expression, err);
        return {
            success: false,
            data: {
                result: false,
                error: err.message
            }
        };
    }
}
