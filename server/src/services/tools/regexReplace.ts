import type { PrismaClient } from '@prisma/client';

interface RegexPattern {
    pattern: string;      // RegExp pattern string, e.g. "\\\\\\[\\[edit\\].*?\\\\\\]"
    flags?:   string;     // RegExp flags, e.g. "g", "gm", "gi"
    replacement: string;  // Replacement string (supports $1, $2 capture groups)
}

/**
 * Applies one or more regex substitutions to a text string in sequence.
 * Each pattern is applied to the output of the previous one.
 *
 * Args:
 *   text:     The input string to process.
 *   patterns: Array of { pattern, flags?, replacement } objects.
 *
 * Returns: { text: string }
 */
export async function regexReplace(
    args: { text: string; patterns: RegexPattern[] },
    _prisma: PrismaClient,
    _userId: string
) {
    const { patterns } = args;
    let text: string = args.text ?? '';

    if (!patterns || patterns.length === 0) {
        return { success: true, data: { text } };
    }

    for (const { pattern, flags = 'g', replacement } of patterns) {
        try {
            const re = new RegExp(pattern, flags);
            text = text.replace(re, replacement);
        } catch (err: any) {
            console.warn(`[regex_replace] Invalid pattern "${pattern}": ${err.message}`);
        }
    }

    console.log(`[Tools] regex_replace: applied ${patterns.length} pattern(s), result length=${text.length}`);

    return {
        success: true,
        data: { text }
    };
}
