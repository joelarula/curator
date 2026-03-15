import * as path from 'path';
import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { prisma } from '../db';

// Define the function schema for code analysis
const analyzeCodeFunction: FunctionDeclaration = {
    name: 'analyze_code',
    description: 'Analyze code and provide a meaningful identifier name and explanation',
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            identifier: {
                type: SchemaType.STRING,
                description: 'A short, meaningful identifier name in camelCase for the code module'
            },
            explanation: {
                type: SchemaType.STRING,
                description: 'A brief explanation of what the code does and its purpose'
            },
            codeType: {
                type: SchemaType.STRING,
                description: 'The type of code (e.g., "component", "utility", "service", "handler", etc.)'
            },
            dependencies: {
                type: SchemaType.ARRAY,
                description: 'List of key dependencies or imports used by this code',
                items: {
                    type: SchemaType.STRING
                }
            }
        },
        required: ['identifier', 'explanation', 'codeType']
    }
};

export async function gemmaCommand(file: string, moduleId: string, options: { prompt?: string }) {
    const filePath = path.resolve(file);

    if (!process.env.GOOGLE_API_KEY) {
        console.error('GOOGLE_API_KEY environment variable is not set.');
        console.log('Please add your Google AI API key to the .env file.');
        process.exit(1);
    }

    try {
        const sourceFile = await prisma.sourceFile.findUnique({
            where: { filePath: filePath }
        });

        if (!sourceFile) {
            console.error(`File not found in database: ${filePath}`);
            console.log('Tip: Run "node dist/index.js ast <file>" first to parse and save it.');
            process.exit(1);
        }

        // Find the module in the database
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

        let moduleBlock = null;
        let targetBlockId: number | null = null;

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

                    // Find the value node to attach metadata to
                    const valueNode = await prisma.astBlock.findFirst({
                        where: {
                            sourceFileId: sourceFile.id,
                            lft: { gt: keyNode.rgt },
                            rgt: { lt: prop.rgt },
                            depth: prop.depth + 1
                        },
                        orderBy: { lft: 'asc' }
                    });

                    if (valueNode) {
                        targetBlockId = valueNode.id;
                    }
                    break;
                }
            }
        }

        if (!moduleBlock) {
            console.error(`Module ${moduleId} not found in ${file}.`);
            return;
        }

        // Get all blocks within this module
        const moduleBlocks = await prisma.astBlock.findMany({
            where: {
                sourceFileId: sourceFile.id,
                lft: { gte: moduleBlock.lft },
                rgt: { lte: moduleBlock.rgt }
            },
            orderBy: { lft: 'asc' }
        });

        // Construct a simplified representation of the module
        let moduleCode = '';
        for (const block of moduleBlocks) {
            if (block.content) {
                moduleCode += block.content + '\n';
            }
        }

        // Limit code size
        const CHAR_LIMIT = 8000;
        if (moduleCode.length > CHAR_LIMIT) {
            moduleCode = moduleCode.substring(0, CHAR_LIMIT) + '\n... (truncated)';
            console.log(`Note: Module code truncated to ${CHAR_LIMIT} characters for analysis.`);
        }

        console.log(`Analyzing module ${moduleId} with Gemini (function calling)...\n`);

        // Initialize Gemini with function calling
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            tools: [{
                functionDeclarations: [analyzeCodeFunction]
            }]
        });

        // Prepare the prompt
        const userPrompt = options.prompt || 'Analyze this code module and provide insights.';
        const prompt = `${userPrompt}

Code Module (ID: ${moduleId}):
\`\`\`javascript
${moduleCode}
\`\`\`

Please analyze this code and call the analyze_code function with:
1. A meaningful identifier name (camelCase)
2. A clear explanation of what it does
3. The type of code (component, utility, service, etc.)
4. Key dependencies if visible`;

        try {
            const result = await model.generateContent(prompt);
            const response = result.response;

            // Check if the model called the function
            const functionCall = response.functionCalls()?.[0];

            if (functionCall && functionCall.name === 'analyze_code') {
                const args = functionCall.args as {
                    identifier?: string;
                    explanation?: string;
                    codeType?: string;
                    dependencies?: string[];
                };

                console.log('✓ Function Call Received!');
                console.log('─'.repeat(60));
                console.log(`Identifier: ${args.identifier || 'N/A'}`);
                console.log(`Code Type: ${args.codeType || 'N/A'}`);
                console.log(`\nExplanation:\n${args.explanation || 'N/A'}`);
                if (args.dependencies && args.dependencies.length > 0) {
                    console.log(`\nDependencies: ${args.dependencies.join(', ')}`);
                }
                console.log('─'.repeat(60));

                // Save to database
                if (targetBlockId && args.identifier) {
                    const fullExplanation = `Type: ${args.codeType || 'unknown'}\n\n${args.explanation || ''}${args.dependencies && args.dependencies.length > 0
                        ? `\n\nDependencies: ${args.dependencies.join(', ')}`
                        : ''
                        }`;

                    await prisma.astBlock.update({
                        where: { id: targetBlockId },
                        data: {
                            meanifiedContent: args.identifier,
                            explanation: fullExplanation
                        }
                    });
                    console.log(`\n✓ Saved to database (Block ID: ${targetBlockId})`);
                }
            } else {
                // Fallback if no function call
                const text = response.text();
                console.log('AI Analysis (text response):');
                console.log('─'.repeat(60));
                console.log(text);
                console.log('─'.repeat(60));

                // Try to extract identifier from text
                const identifierMatch = text.match(/(?:identifier|name):\s*`?([a-zA-Z0-9_]+)`?/i);

                if (targetBlockId && identifierMatch) {
                    await prisma.astBlock.update({
                        where: { id: targetBlockId },
                        data: {
                            meanifiedContent: identifierMatch[1],
                            explanation: text
                        }
                    });
                    console.log(`\n✓ Saved to database (Block ID: ${targetBlockId})`);
                } else if (targetBlockId) {
                    await prisma.astBlock.update({
                        where: { id: targetBlockId },
                        data: {
                            explanation: text
                        }
                    });
                    console.log(`\n✓ Saved analysis to database (Block ID: ${targetBlockId})`);
                }
            }

        } catch (error) {
            console.error('Error calling Gemini:', error);
        }

    } catch (error) {
        console.error('Error in gemma command:', error);
    } finally {
        await prisma.$disconnect();
    }
}
