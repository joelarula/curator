import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../db';

export async function meanifyAllCommand(file: string, options: { delay?: string }) {
    const filePath = path.resolve(file);
    const delayMs = options.delay ? parseInt(options.delay) : 1000; // Default 1 second delay

    if (!process.env.GOOGLE_API_KEY) {
        console.error('GOOGLE_API_KEY environment variable is not set.');
        process.exit(1);
    }

    try {
        const sourceFile = await prisma.sourceFile.findUnique({
            where: { filePath: filePath }
        });

        if (!sourceFile) {
            console.error(`File not found in database: ${filePath}`);
            process.exit(1);
        }

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

        // Get children of the main argument array [ChunkIds, Modules, EntryPoints]
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

        // Find all module properties
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

        console.log(`Found ${properties.length} total modules in the bundle.`);

        // Collect unmeanified modules
        const unmeanifiedModules: Array<{ moduleId: string; blockId: number; code: string }> = [];

        for (const prop of properties) {
            // Check key
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

                if (key) {
                    // Find the value node (the function)
                    const valueNode = await prisma.astBlock.findFirst({
                        where: {
                            sourceFileId: sourceFile.id,
                            lft: { gt: keyNode.rgt },
                            rgt: { lt: prop.rgt },
                            depth: prop.depth + 1
                        },
                        orderBy: { lft: 'asc' }
                    });

                    // Check if already meanified
                    if (valueNode && !valueNode.meanifiedContent) {
                        // Extract module code
                        const moduleCode = await extractModuleCodeFromFile(filePath, key);
                        if (moduleCode) {
                            unmeanifiedModules.push({
                                moduleId: key,
                                blockId: valueNode.id,
                                code: moduleCode
                            });
                        }
                    }
                }
            }
        }

        console.log(`Found ${unmeanifiedModules.length} unmeanified modules.\n`);

        if (unmeanifiedModules.length === 0) {
            console.log('All modules are already meanified!');
            return;
        }

        // Initialize Gemini API
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        const CHAR_LIMIT = 500000;
        let processedCount = 0;
        let skippedCount = 0;

        // Process each module
        for (let i = 0; i < unmeanifiedModules.length; i++) {
            const { moduleId, blockId, code } = unmeanifiedModules[i];

            console.log(`[${i + 1}/${unmeanifiedModules.length}] Processing module ${moduleId}...`);

            // Check size limit
            if (code.length > CHAR_LIMIT) {
                console.log(`  ⚠️  Skipped: Module too large (${code.length} chars, limit is ${CHAR_LIMIT})`);
                skippedCount++;
                continue;
            }

            const prompt = `Analyze the following Webpack module code. Explain its purpose and provide a meaningful TypeScript identifier for it.
        
Code:
\`\`\`javascript
${code}
\`\`\`

Output format:
Identifier: <identifier>
Explanation: <explanation>
`;

            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                // Parse output
                const identifierMatch = text.match(/Identifier:\s*`?([a-zA-Z0-9_]+)`?/);
                const explanationMatch = text.match(/Explanation:\s*([\s\S]*)/);

                if (identifierMatch) {
                    const identifier = identifierMatch[1];
                    const explanation = explanationMatch ? explanationMatch[1].trim() : text;

                    await prisma.astBlock.update({
                        where: { id: blockId },
                        data: {
                            meanifiedContent: identifier,
                            explanation: explanation
                        }
                    });

                    console.log(`  ✓ Saved: ${identifier}`);
                    processedCount++;
                } else {
                    console.log(`  ⚠️  Could not parse identifier from response`);
                    skippedCount++;
                }

                // Add delay between requests to avoid rate limiting
                if (i < unmeanifiedModules.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }

            } catch (error: any) {
                // Check for rate limit errors
                const errorMessage = error.message?.toLowerCase() || '';
                const isRateLimit =
                    error.status === 429 ||
                    errorMessage.includes('resource_exhausted') ||
                    errorMessage.includes('quota') ||
                    errorMessage.includes('rate limit');

                if (isRateLimit) {
                    console.log(`\n❌ Rate limit reached at module ${moduleId}`);
                    console.log(`Processed ${processedCount} modules successfully before hitting rate limit.`);
                    console.log(`Remaining: ${unmeanifiedModules.length - i} modules`);
                    console.log('\nTip: Try again later or increase the delay with --delay flag.');
                    break;
                } else {
                    console.error(`  ❌ Error processing module ${moduleId}:`, error.message);
                    skippedCount++;
                }
            }
        }

        console.log(`\n=== Summary ===`);
        console.log(`Processed: ${processedCount}`);
        console.log(`Skipped: ${skippedCount}`);
        console.log(`Total: ${unmeanifiedModules.length}`);

    } catch (error) {
        console.error('Error in meanify-all command:', error);
    } finally {
        await prisma.$disconnect();
    }
}

// Helper function to extract module code from file using TypeScript
async function extractModuleCodeFromFile(filePath: string, moduleId: string): Promise<string | null> {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true
    );

    let moduleCode: string | null = null;

    function visit(node: ts.Node) {
        if (moduleCode) return;

        if (ts.isCallExpression(node)) {
            if (ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'push') {

                if (node.arguments.length > 0 && ts.isArrayLiteralExpression(node.arguments[0])) {
                    const mainArray = node.arguments[0] as ts.ArrayLiteralExpression;

                    if (mainArray.elements.length >= 2) {
                        const modulesArg = mainArray.elements[1];
                        if (ts.isObjectLiteralExpression(modulesArg)) {
                            for (const prop of modulesArg.properties) {
                                if (ts.isPropertyAssignment(prop)) {
                                    let key = '';
                                    if (ts.isStringLiteral(prop.name)) {
                                        key = prop.name.text;
                                    } else if (ts.isIdentifier(prop.name)) {
                                        key = prop.name.text;
                                    } else if (ts.isNumericLiteral(prop.name)) {
                                        key = prop.name.text;
                                    }

                                    if (key === moduleId) {
                                        moduleCode = prop.initializer.getText(sourceFile);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!moduleCode) {
            ts.forEachChild(node, visit);
        }
    }

    visit(sourceFile);
    return moduleCode;
}
