import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../db';

export async function referencesCommand(file: string, targetModuleId: string) {
    const filePath = path.resolve(file);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    try {
        // Find the source file in the database
        const sourceFile = await prisma.sourceFile.findUnique({
            where: { filePath: filePath }
        });

        if (!sourceFile) {
            console.error('File not found in database. Please run the ast command first.');
            process.exit(1);
        }

        console.log(`Searching for usage of module '${targetModuleId}'...`);
        console.log('--- References ---');

        // Find the main CallExpression (Webpack push)
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
            console.error('Could not find Webpack modules structure in database.');
            process.exit(1);
        }

        const callExpr = topLevel[0];

        // Get children of CallExpression to find arguments
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
            console.error('Could not find Webpack modules structure in database.');
            process.exit(1);
        }

        const mainArg = children[1];
        if (mainArg.type !== 'ArrayLiteralExpression') {
            console.error('Unexpected Webpack structure in database.');
            process.exit(1);
        }

        // Get children of main array
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
            console.error('Could not find modules object in database.');
            process.exit(1);
        }

        const modulesArg = argChildren[1];
        if (modulesArg.type !== 'ObjectLiteralExpression') {
            console.error('Unexpected modules structure in database.');
            process.exit(1);
        }

        // Get all PropertyAssignments (modules)
        const moduleProperties = await prisma.astBlock.findMany({
            where: {
                sourceFileId: sourceFile.id,
                lft: { gt: modulesArg.lft },
                rgt: { lt: modulesArg.rgt },
                depth: modulesArg.depth + 1,
                type: 'PropertyAssignment'
            },
            orderBy: { lft: 'asc' }
        });

        let foundCount = 0;

        // For each module, check if it contains the target module ID
        for (const moduleProp of moduleProperties) {
            // Get the module key (first child)
            const moduleKey = await prisma.astBlock.findFirst({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gt: moduleProp.lft },
                    rgt: { lt: moduleProp.rgt },
                    depth: moduleProp.depth + 1
                },
                orderBy: { lft: 'asc' }
            });

            if (!moduleKey || !moduleKey.content) continue;

            let currentModuleId = moduleKey.content.trim();
            if (currentModuleId.startsWith('"') || currentModuleId.startsWith("'")) {
                currentModuleId = currentModuleId.slice(1, -1);
            }

            // Get the module value (second child) - this is the function body
            const moduleValue = await prisma.astBlock.findFirst({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gt: moduleProp.lft },
                    rgt: { lt: moduleProp.rgt },
                    depth: moduleProp.depth + 1
                },
                orderBy: { lft: 'asc' },
                skip: 1
            });

            if (!moduleValue) continue;

            // Search for StringLiteral or NumericLiteral descendants that match the target
            const references = await prisma.astBlock.findMany({
                where: {
                    sourceFileId: sourceFile.id,
                    lft: { gt: moduleValue.lft },
                    rgt: { lt: moduleValue.rgt },
                    type: { in: ['StringLiteral', 'NumericLiteral'] },
                    content: { contains: targetModuleId }
                }
            });

            // Check if any reference exactly matches the target module ID
            const hasExactMatch = references.some(ref => {
                if (!ref.content) return false;
                let refContent = ref.content.trim();
                if (refContent.startsWith('"') || refContent.startsWith("'")) {
                    refContent = refContent.slice(1, -1);
                }
                return refContent === targetModuleId;
            });

            if (hasExactMatch) {
                console.log(`Used in: ${currentModuleId}`);
                foundCount++;
            }
        }

        console.log(`Total References: ${foundCount}`);
    } catch (e) {
        console.error('Error searching for references:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}
