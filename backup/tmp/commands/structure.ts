import * as path from 'path';
import { prisma } from '../db';

export async function structureCommand(file: string, options: { depth?: string; module?: string }) {
    const filePath = path.resolve(file);
    const maxDepth = options.depth ? parseInt(options.depth, 10) : 10;
    const moduleId = options.module;

    try {
        // Find the source file
        const sourceFile = await prisma.sourceFile.findUnique({
            where: { filePath: filePath }
        });

        if (!sourceFile) {
            console.error(`File not found in database: ${filePath}`);
            console.log('Tip: Run "meanifier ast <file>" first to parse and save it.');
            process.exit(1);
        }

        let blocks;

        if (moduleId) {
            // Find the specific module first
            console.log(`Finding module ${moduleId} in ${sourceFile.filePath}...\n`);

            // Find the webpack modules object
            const topLevel = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    depth: { lte: 5 },
                    type: 'CallExpression'
                },
                orderBy: { lft: 'asc' },
                take: 1
            });

            if (topLevel.length === 0) {
                console.error('No CallExpression found. Is this a Webpack bundle?');
                return;
            }

            const callExpr = topLevel[0];

            // Get children of the CallExpression
            const children = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gt: callExpr.lft },
                    rgt: { lt: callExpr.rgt },
                    depth: callExpr.depth + 1
                },
                orderBy: { lft: 'asc' }
            });

            if (children.length < 2) {
                console.error('CallExpression does not have enough arguments.');
                return;
            }

            const mainArg = children[1];
            if (mainArg.type !== 'ArrayLiteralExpression') {
                console.error('Expected argument to be an ArrayLiteralExpression.');
                return;
            }

            // Get children of the main argument array
            const argChildren = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gt: mainArg.lft },
                    rgt: { lt: mainArg.rgt },
                    depth: mainArg.depth + 1
                },
                orderBy: { lft: 'asc' }
            });

            if (argChildren.length < 2) {
                console.error('Main array argument does not have enough elements.');
                return;
            }

            const modulesArg = argChildren[1];

            if (!modulesArg || modulesArg.type !== 'ObjectLiteralExpression') {
                console.error('Could not find Modules object (Arg 1).');
                return;
            }

            // Find the specific module property
            const properties = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gt: modulesArg.lft },
                    rgt: { lt: modulesArg.rgt },
                    depth: modulesArg.depth + 1,
                    type: 'PropertyAssignment'
                },
                orderBy: { lft: 'asc' }
            });

            let moduleBlock = null;

            for (const prop of properties) {
                const keyNode = await prisma.astBlock.findFirst({
                    where: {
                        sourceFileId: sourceFile.id,
                        lft: { gt: prop.lft },
                        rgt: { lt: prop.rgt },
                        depth: prop.depth + 1
                    },
                    orderBy: { lft: 'asc' }
                });

                if (keyNode) {
                    let key = keyNode.content?.trim();
                    if (key && (key.startsWith('"') || key.startsWith("'"))) {
                        key = key.slice(1, -1);
                    }

                    if (key === moduleId) {
                        moduleBlock = prop;
                        break;
                    }
                }
            }

            if (!moduleBlock) {
                console.error(`Module ${moduleId} not found in ${file}.`);
                return;
            }

            console.log(`Structure for module ${moduleId} (max depth: ${maxDepth}):\n`);

            // Fetch blocks within this module's range, with relative depth
            const moduleDepth = moduleBlock.depth;
            blocks = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gte: moduleBlock.lft },
                    rgt: { lte: moduleBlock.rgt },
                    depth: { lte: moduleDepth + maxDepth }
                },
                orderBy: { lft: 'asc' }
            });

            // Adjust depth display to be relative to module
            for (const block of blocks) {
                const relativeDepth = block.depth - moduleDepth;
                const indent = '  '.repeat(relativeDepth);
                let contentSnippet = '';
                if (block.content) {
                    const cleanContent = block.content.replace(/\r?\n/g, '\\n').substring(0, 50);
                    contentSnippet = `: ${cleanContent}${block.content.length > 50 ? '...' : ''}`;
                }

                let meanifiedInfo = '';
                if (block.meanifiedContent) {
                    meanifiedInfo = ` 🏷️  ${block.meanifiedContent}`;
                }

                console.log(`${indent}[${block.type}]${contentSnippet}${meanifiedInfo}`);
            }

        } else {
            console.log(`Structure for ${sourceFile.filePath} (max depth: ${maxDepth}):\n`);

            blocks = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    depth: { lte: maxDepth }
                },
                orderBy: { lft: 'asc' }
            });

            for (const block of blocks) {
                const indent = '  '.repeat(block.depth);
                let contentSnippet = '';
                if (block.content) {
                    const cleanContent = block.content.replace(/\r?\n/g, '\\n').substring(0, 50);
                    contentSnippet = `: ${cleanContent}${block.content.length > 50 ? '...' : ''}`;
                }

                let meanifiedInfo = '';
                if (block.meanifiedContent) {
                    meanifiedInfo = ` 🏷️  ${block.meanifiedContent}`;
                }

                console.log(`${indent}[${block.type}]${contentSnippet}${meanifiedInfo}`);
            }
        }

    } catch (error) {
        console.error('Error fetching structure:', error);
    } finally {
        await prisma.$disconnect();
    }
}
