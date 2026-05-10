
/**
 * Utility tool that simply returns the provided items array.
 * Useful for starting a fan-out (onItem) from an arbitrary array in context.
 */
export async function iterate(
    args: { items: any[] }
) {
    const items = Array.isArray(args.items) ? args.items : [];
    console.log(`[Tools] iterate: received ${items.length} items`);
    return {
        success: true,
        items
    };
}
