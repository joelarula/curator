import { VOCAB } from '../../constants/vocabulary.js';

/**
 * Format List Tool
 * 
 * Aggregates an array of objects into a single formatted string based on a template.
 * Useful for building readable prompts from tool results.
 */
export async function format_list(
    args: { items: any[], template: string, separator?: string }
) {
    const { items, template, separator = '\n\n' } = args;

    if (!Array.isArray(items)) {
        return { success: false, error: 'items must be an array', data: '' };
    }

    console.log(`[Tools] format_list: formatting ${items.length} items using template...`);


    const formatted = items.map(item => {
        let result = template;
        // Simple regex-based template replacement for the item's properties
        return result.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            const value = path.split('.').reduce((acc: any, p: string) => acc?.[p], item);
            return value !== undefined && value !== null ? String(value) : '';
        });
    }).join(separator);

    return {
        success: true,
        data: formatted,
        count: items.length
    };
}
