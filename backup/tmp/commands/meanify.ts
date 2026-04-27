import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../db';

export async function meanifyCommand(file: string, moduleId: string) {
    const filePath = path.resolve(file);

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

        // 1. Find the main CallExpression (Webpack push)
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

        // Find the specific module by ID
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

        let targetBlockId: number | null = null;
        let targetModuleCode: string | null = null;

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

                if (key === moduleId) {
                    // Found the module!

                    // Find the value node (the function) to attach metadata to
                    const valueNode = await prisma.astBlock.findFirst({
                        where: {
                            sourceFileId: sourceFile.id,
                            lft: { gt: keyNode.rgt }, // After the key
                            rgt: { lt: prop.rgt },
                            depth: prop.depth + 1
                        },
                        orderBy: { lft: 'asc' }
                    });

                    if (valueNode) {
                        targetBlockId = valueNode.id;
                    }

                    // Use TS to extract code from file
                    targetModuleCode = await extractModuleCodeFromFile(filePath, moduleId);
                    break;
                }
            }
        }

        if (!targetModuleCode) {
            console.error(`Module ${moduleId} not found in ${file}.`);
            return;
        }

        // Safety check for module size
        // Gemini 1.5 Flash has a 1M token context window (~4MB text).
        // However, for a single module explanation, we probably don't want to process massive files.
        // Let's set a limit of 500,000 characters (~125k tokens) to be safe and efficient.
        const CHAR_LIMIT = 500000;
        if (targetModuleCode.length > CHAR_LIMIT) {
            console.error(`Module ${moduleId} is too large (${targetModuleCode.length} chars). Limit is ${CHAR_LIMIT} chars.`);
            return;
        }

        console.log(`Analyzing module ${moduleId} (${targetModuleCode.length} chars)...`);

        // Call Gemini API
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        // Try gemini-2.5-flash first (as requested), fallback to gemini-1.5-flash
        //let model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        let model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });


        const prompt = `Analyze the following Webpack module code. Explain its purpose and provide a meaningful TypeScript identifier for it.
        
        Code:
        \`\`\`javascript
        ${targetModuleCode}
        \`\`\`
        
        Output format:
        Identifier: <identifier>
        Explanation: <explanation>
        `;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            console.log(text);

            // Parse output
            const identifierMatch = text.match(/Identifier:\s*`?([a-zA-Z0-9_]+)`?/);
            const explanationMatch = text.match(/Explanation:\s*([\s\S]*)/);

            if (targetBlockId && identifierMatch) {
                const identifier = identifierMatch[1];
                const explanation = explanationMatch ? explanationMatch[1].trim() : text;

                await prisma.astBlock.update({
                    where: { id: targetBlockId },
                    data: {
                        meanifiedContent: identifier,
                        explanation: explanation
                    }
                });
                console.log(`\nSaved to database (Block ID: ${targetBlockId})`);
            }

        } catch (error: any) {
            if (error.message?.includes('404') || error.message?.includes('not found')) {
                console.log('Gemini 2.5 Flash not found, falling back to 1.5 Flash...');
                model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                console.log(text);

                // Parse output
                const identifierMatch = text.match(/Identifier:\s*`?([a-zA-Z0-9_]+)`?/);
                const explanationMatch = text.match(/Explanation:\s*([\s\S]*)/);

                if (targetBlockId && identifierMatch) {
                    const identifier = identifierMatch[1];
                    const explanation = explanationMatch ? explanationMatch[1].trim() : text;

                    await prisma.astBlock.update({
                        where: { id: targetBlockId },
                        data: {
                            meanifiedContent: identifier,
                            explanation: explanation
                        }
                    });
                    console.log(`\nSaved to database (Block ID: ${targetBlockId})`);
                }
            } else {
                console.error('Error in meanify command:', error);
            }
        }
    } catch (error) {
        console.error('Error in meanify command:', error);
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
