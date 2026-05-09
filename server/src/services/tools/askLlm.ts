import { PrismaClient } from '@prisma/client';
import { AIService } from '../AIService.js';
import { resolveModelName, AI_MODELS } from '../AIModelRegistry.js';

export async function askLlm(
    args: any,
    prisma: PrismaClient,
    userId: string,
    responseId: number,
    request: any
) {
    console.log(`[Tool] Executing ask_llm...`);
    const { prompt: rawPrompt, saveAsRole, model: modelArg, output = 'TEXT' } = args;
    const modelName = modelArg ? resolveModelName(modelArg) : 'gemini-3.1-flash-lite-preview';
    const modelShortName = AI_MODELS.find(m => m.name === modelName)?.shortName ?? modelArg ?? 'g31fl';
    
    if (!rawPrompt) {
        throw new Error('ask_llm requires a prompt argument');
    }

    // 1. Get context resources
    const requestWithResources = await prisma.request.findUnique({
        where: { id: request.id },
        include: { resources: { include: { texts: { include: { role: true } } } } }
    });

    const resources = requestWithResources?.resources || [];

    // 2. Materialize prompt if it contains templates
    let prompt = rawPrompt;
    const res = resources[0];
    if (res) {
        prompt = prompt
            .replace(/{{resource\.title}}/g, res.title || '')
            .replace(/{{resource\.uri}}/g, res.uri || '')
            .replace(/{{resource\.description}}/g, res.description || '');
    }

    // 3. Build context block
    let context = '';
    if (resources.length) {
        context = resources.map(r => {
            let str = `Resource: ${r.title} (${r.uri})\n${r.description || ''}`;
            if (r.texts?.length) {
                str += '\n\nContent:\n' + r.texts.map(t => `[${t.role?.name || 'TEXT'}]: ${t.content}`).join('\n\n---\n\n');
            }
            return str;
        }).join('\n\n=================\n\n');
    }

    const fullPrompt = context ? `${prompt}\n\nContext:\n${context}` : prompt;

    try {
        const result = await AIService.runPromptWithModel(fullPrompt, modelName);

        let data: any = { result };
        let extractedItems: any[] | undefined = undefined;

        // 4. Handle Structured Output
        if (output === 'JSON' || output === 'LIST') {
            try {
                // Try to find JSON in Markdown blocks
                const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\[\s*\{.*\}\s*\]/s) || result.match(/\{\s*".*"\s*\}/s);
                const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
                const parsed = JSON.parse(jsonStr.trim());
                
                if (output === 'LIST' && Array.isArray(parsed)) {
                    extractedItems = parsed;
                    data.count = parsed.length;
                } else {
                    data = { ...data, ...parsed };
                }
            } catch (e) {
                console.warn(`[Tool] ask_llm: Failed to parse expected ${output} output: ${e}`);
            }
        }

        // 5. If requested, save the output as a Text record on the primary resource
        const primaryResource = resources[0];
        if (saveAsRole && primaryResource) {
            const roleName = saveAsRole.toUpperCase();
            
            let textRole = await prisma.textRole.findUnique({ where: { name: roleName } });
            if (!textRole) textRole = await prisma.textRole.create({ data: { name: roleName } });

            await prisma.text.upsert({
                where: { 
                    resourceId_roleId: { 
                        resourceId: primaryResource.id, 
                        roleId: textRole.id 
                    } 
                },
                update: { content: result },
                create: {
                    content: result,
                    roleId: textRole.id,
                    resourceId: primaryResource.id,
                    userId,
                    isPublished: primaryResource.isPublished ?? false,
                }
            });
            console.log(`[Tools] ask_llm: saved response as Text(role=${roleName})`);
        }

        return {
            data,
            extractedItems,
            createdItem: resources.length ? resources[0] : null,
            aiModel: { name: modelName, shortName: modelShortName, provider: 'Google' }
        };
    } catch (e: any) {
        throw new Error(`ask_llm failed: ${e.message}`);
    }
}
