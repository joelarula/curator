import * as ts from 'typescript';
import { PrismaClient } from '@prisma/client';

interface AstBlockData {
    sourceFileId: number;
    type: string;
    content: string | null;
    lft: number;
    rgt: number;
    depth: number;
}

export async function saveAstBlocks(
    sourceFileId: number,
    sourceFile: ts.SourceFile,
    prisma: PrismaClient
) {
    let counter = 0;
    const BATCH_SIZE = 500;
    let batch: AstBlockData[] = [];

    async function flushBatch() {
        if (batch.length > 0) {
            await prisma.astBlock.createMany({ data: batch });
            console.log(`Saved batch of ${batch.length} blocks`);
            batch = [];
        }
    }

    async function traverse(node: ts.Node, depth: number) {
        const lft = ++counter;

        let content: string | null = null;
        try {
            content = node.getText(sourceFile);
            if (content && content.length > 500) {
                content = content.substring(0, 500) + '...';
            }
        } catch (e) { }

        // Collect children first to iterate asynchronously
        const children: ts.Node[] = [];
        ts.forEachChild(node, c => { children.push(c); });

        for (const child of children) {
            await traverse(child, depth + 1);
        }

        const rgt = ++counter;

        const nodeData: AstBlockData = {
            sourceFileId,
            type: ts.SyntaxKind[node.kind],
            content,
            lft,
            rgt,
            depth,
        };

        batch.push(nodeData);
        if (batch.length >= BATCH_SIZE) {
            await flushBatch();
        }
    }

    await traverse(sourceFile, 0);
    await flushBatch(); // Flush remaining

    console.log(`Finished saving AST blocks for file ${sourceFile.fileName}`);
}
