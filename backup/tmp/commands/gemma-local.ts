import * as path from 'path';
import { pipeline } from '@huggingface/transformers';
import { prisma } from '../db';

let generator: any = null;

async function initializeFunctionGemma() {
    if (!generator) {
        if (process.env.HUGGINGFACE_TOKEN) {
            process.env.HF_TOKEN = process.env.HUGGINGFACE_TOKEN;
            console.log('✓ Using Hugging Face token for authenticated download\n');
        }

        console.log('Loading FunctionGemma model locally...');
        generator = await pipeline('text-generation', 'onnx-community/functiongemma-270m-it-ONNX', {
            dtype: 'q4',
            device: 'cpu',
        });
        console.log('Model loaded successfully!\n');
    }
    return generator;
}

export async function gemmaLocalCommand(file: string, moduleId: string, options: { prompt?: string }) {
    const filePath = path.resolve(file);

    try {
        const sourceFile = await prisma.sourceFile.findUnique({
            where: { filePath: filePath }
        });

        if (!sourceFile) {
            console.error(`File not found: ${filePath}`);
            process.exit(1);
        }

        // --- Database Logic to Fetch Module Code ---
        const topLevel = await prisma.astBlock.findMany({
            where: { sourceFileId: sourceFile.id, depth: { lte: 5 }, type: 'CallExpression' },
            orderBy: { lft: 'asc' },
            take: 1
        });
        if (topLevel.length === 0) return console.error('No CallExpression found.');

        const callExpr = topLevel[0];
        const children = await prisma.astBlock.findMany({
            where: { sourceFileId: sourceFile.id, lft: { gt: callExpr.lft }, rgt: { lt: callExpr.rgt }, depth: callExpr.depth + 1 },
            orderBy: { lft: 'asc' }
        });
        if (children.length < 2) return console.error('Invalid webpack bundle format.');
        const mainArg = children[1];

        const argChildren = await prisma.astBlock.findMany({
            where: { sourceFileId: sourceFile.id, lft: { gt: mainArg.lft }, rgt: { lt: mainArg.rgt }, depth: mainArg.depth + 1 },
            orderBy: { lft: 'asc' }
        });
        const modulesArg = argChildren[1];

        const properties = await prisma.astBlock.findMany({
            where: { sourceFileId: sourceFile.id, lft: { gt: modulesArg.lft }, rgt: { lt: modulesArg.rgt }, depth: modulesArg.depth + 1, type: 'PropertyAssignment' },
            orderBy: { lft: 'asc' }
        });

        let targetBlockId = null;
        let moduleCode = '';

        for (const prop of properties) {
            const keyNode = await prisma.astBlock.findFirst({
                where: { sourceFileId: sourceFile.id, lft: { gt: prop.lft }, rgt: { lt: prop.rgt } },
                orderBy: { lft: 'asc' }
            });

            if (keyNode) {
                let key = keyNode.content?.trim().replace(/^['"]|['"]$/g, '');
                if (key === moduleId) {
                    const valueNode = await prisma.astBlock.findFirst({
                        where: { sourceFileId: sourceFile.id, lft: { gt: keyNode.rgt }, rgt: { lt: prop.rgt } },
                        orderBy: { lft: 'asc' }
                    });
                    if (valueNode) targetBlockId = valueNode.id;

                    const blockContent = await prisma.astBlock.findMany({
                        where: { sourceFileId: sourceFile.id, lft: { gte: prop.lft }, rgt: { lte: prop.rgt } },
                        orderBy: { lft: 'asc' }
                    });
                    moduleCode = blockContent.map(b => b.content).join('\n');
                    break;
                }
            }
        }

        if (!targetBlockId) return console.error(`Module ${moduleId} not found.`);

        if (moduleCode.length > 2000) {
            moduleCode = moduleCode.substring(0, 2000) + '...';
            console.log('Code truncated to 2000 chars.');
        }

        console.log(`Analyzing module ${moduleId} with FunctionGemma (local)...\n`);

        const model = await initializeFunctionGemma();

        const tools = [
            {
                type: "function",
                function: {
                    name: "analyze_code",
                    description: "Analyze code module to provide identifier and explanation",
                    parameters: {
                        type: "object",
                        properties: {
                            identifier: { type: "string", description: "CamelCase name for the module" },
                            explanation: { type: "string", description: "What the code does" },
                            codeType: { type: "string", enum: ["component", "service", "utility", "other"] }
                        },
                        required: ["identifier", "explanation", "codeType"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "run_meanifier_command",
                    description: "Run a Meanifier CLI command",
                    parameters: {
                        type: "object",
                        properties: {
                            command: { type: "string", enum: ["clean", "ast", "structure", "references", "meanify"], description: "The command to run" },
                            arguments: { type: "object", description: "Arguments for the command. e.g. { file: '...' } or {}" }
                        },
                        required: ["command"]
                    }
                }
            }
        ];

        const userMessage = {
            role: "user",
            content: `Analyze this code. If it needs further processing, suggest a meanifier command.\n\nCode:\n${moduleCode}`
        };

        const output = await model([userMessage], {
            tools: tools,
            max_new_tokens: 256,
            temperature: 0.1,
        });

        const generatedText = output[0].generated_text;
        let assistantMessage: any = null;

        if (Array.isArray(generatedText)) {
            assistantMessage = generatedText[generatedText.length - 1];
        } else {
            assistantMessage = generatedText;
        }

        console.log('Model Response:', JSON.stringify(assistantMessage, null, 2));

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            const call = assistantMessage.tool_calls[0];
            const args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;

            console.log(`\n✓ Tool Call Detected: ${call.function.name}`);

            if (call.function.name === 'analyze_code') {
                console.log(`Identifier: ${args.identifier}`);
                console.log(`Explanation: ${args.explanation}`);
                if (targetBlockId) {
                    await prisma.astBlock.update({
                        where: { id: targetBlockId },
                        data: {
                            meanifiedContent: args.identifier,
                            explanation: `Type: ${args.codeType}\n\n${args.explanation}`
                        }
                    });
                    console.log(`\n✓ Saved to database (Block ID: ${targetBlockId})`);
                }
            } else if (call.function.name === 'run_meanifier_command') {
                console.log(`\n[AGENT] Suggests running: meanifier ${args.command} ${JSON.stringify(args.arguments || {})}`);
            }
        } else {
            console.log('No tool calls made. Response:', assistantMessage.content);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

export async function agentCommand(prompt: string) {
    console.log(`[AGENT] Received prompt: "${prompt}"\n`);
    const model = await initializeFunctionGemma();

    const tools = [
        {
            type: "function",
            function: {
                name: "run_meanifier_command",
                description: "Run a Meanifier CLI command",
                parameters: {
                    type: "object",
                    properties: {
                        command: { type: "string", enum: ["clean", "ast", "structure", "references", "meanify"], description: "The command to run" },
                        arguments: { type: "object", description: "Arguments for the command. e.g. { file: '...' } or {}" }
                    },
                    required: ["command"]
                }
            }
        }
    ];

    const messages = [
        {
            role: "user", content: `You are an intelligent agent for the 'meanifier' CLI tool. 
Available commands:
- clean: Reset database
- ast <file>: Parse file to DB
- structure <file>: Show structure
- references <file> <id>: Find refs
- meanify <file> <id>: Rename

User Request: "${prompt}"

Decide which command to run. If unsure, reply with text.` }
    ];

    try {
        const output = await model(messages, {
            tools: tools,
            max_new_tokens: 128,
            temperature: 0.1
        });

        const generatedText = output[0].generated_text;
        const assistantMessage = Array.isArray(generatedText) ? generatedText[generatedText.length - 1] : generatedText;

        console.log('Model Response:', JSON.stringify(assistantMessage, null, 2));

        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            const call = assistantMessage.tool_calls[0];
            const args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;

            console.log(`\n✓ [AGENT] Decided to run: meanifier ${args.command} ${JSON.stringify(args.arguments || {})}`);
            console.log(`Tip: functionality to auto-run this command is coming soon!`);
        } else {
            console.log('\n[AGENT] Response:', assistantMessage.content);
        }

    } catch (error) {
        console.error('Error in agent command:', error);
    } finally {
        await prisma.$disconnect();
    }
}
