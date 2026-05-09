import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { prisma } from '../db';
import { saveAstBlocks } from '../astManager';

export async function astCommand(file: string) {
    console.time('Execution time');
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true
    );

    // Simple circular reference handler
    const seen = new WeakSet();
    const output = JSON.stringify(sourceFile, (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
                return;
            }
            seen.add(value);
        }
        // Skip parent pointers and other potentially circular or huge fields
        if (key === 'parent' || key === 'sourceFile' || key === 'checker') return undefined;
        return value;
    }, 2);

    const outputPath = `${filePath}.ast.json`;
    fs.writeFileSync(outputPath, output);
    console.log(`AST written to ${outputPath}`);

    // Save to Database
    try {
        const savedFile = await prisma.sourceFile.upsert({
            where: { filePath: filePath },
            update: {
                content: fileContent,
                ast: zlib.gzipSync(output),
                createdAt: new Date()
            },
            create: {
                filePath: filePath,
                content: fileContent,
                ast: zlib.gzipSync(output)
            }
        });
        // Save AST blocks
        await saveAstBlocks(savedFile.id, sourceFile, prisma);

        console.log(`AST saved to database with ID: ${savedFile.id}`);
    } catch (error) {
        console.error('Error saving to database:', error);
    } finally {
        await prisma.$disconnect();
    }

    console.timeEnd('Execution time');
}
