import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../db';

export async function webpackCommand(file: string) {
    const filePath = path.resolve(file);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    // Fetch meanified names from DB
    const meanifiedMap = new Map<string, string>();
    try {
        const sourceFile = await prisma.sourceFile.findUnique({
            where: { filePath: filePath }
        });

        if (sourceFile) {
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

            if (topLevel.length > 0) {
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

                if (children.length >= 2) {
                    const mainArg = children[1];
                    if (mainArg.type === 'ArrayLiteralExpression') {
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

                        if (argChildren.length >= 2) {
                            const modulesArg = argChildren[1];
                            if (modulesArg.type === 'ObjectLiteralExpression') {
                                // Fetch all descendants of modulesArg (Properties, Keys, Values)
                                // We want depth + 1 (PropertyAssignment) and depth + 2 (Key/Value)
                                const descendants = await prisma.astBlock.findMany({
                                    where: {
                                        sourceFileId: sourceFile.id,
                                        lft: { gt: modulesArg.lft },
                                        rgt: { lt: modulesArg.rgt },
                                        depth: { lte: modulesArg.depth + 2 }
                                    },
                                    orderBy: { lft: 'asc' }
                                });

                                // Process descendants to build map
                                // Structure: PropertyAssignment -> [Key, Value]
                                // We can iterate and look for PropertyAssignments
                                for (let i = 0; i < descendants.length; i++) {
                                    const node = descendants[i];
                                    if (node.type === 'PropertyAssignment') {
                                        // Find children (Key and Value) in the descendants list
                                        // They should be immediately following in the list since it's ordered by lft
                                        // and they are children.

                                        // Simple heuristic: look ahead for nodes with depth = node.depth + 1
                                        // The first one is Key, second is Value.
                                        let keyNode = null;
                                        let valueNode = null;

                                        for (let j = i + 1; j < descendants.length; j++) {
                                            const child = descendants[j];
                                            if (child.depth <= node.depth) break; // End of children
                                            if (child.depth === node.depth + 1) {
                                                if (!keyNode) keyNode = child;
                                                else if (!valueNode) valueNode = child;
                                            }
                                        }

                                        if (keyNode && valueNode && valueNode.meanifiedContent) {
                                            let key = keyNode.content?.trim();
                                            if (key && (key.startsWith('"') || key.startsWith("'"))) {
                                                key = key.slice(1, -1);
                                            }
                                            if (key) {
                                                meanifiedMap.set(key, valueNode.meanifiedContent);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Could not fetch meanified names from DB:", e);
    } finally {
        await prisma.$disconnect();
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true
    );

    let modulesFound = false;
    let entryFound = false;

    function visit(node: ts.Node) {
        // Look for CallExpression: (window["webpackJsonp"] = ...).push(...)
        if (ts.isCallExpression(node)) {
            // Check if it's a push call
            if (ts.isPropertyAccessExpression(node.expression) &&
                node.expression.name.text === 'push') {

                // Check arguments
                if (node.arguments.length > 0 && ts.isArrayLiteralExpression(node.arguments[0])) {
                    const mainArray = node.arguments[0] as ts.ArrayLiteralExpression;

                    if (mainArray.elements.length >= 2) {
                        // Element 1: Modules object
                        const modulesArg = mainArray.elements[1];
                        if (ts.isObjectLiteralExpression(modulesArg)) {
                            console.log('--- Module IDs ---');
                            let count = 0;
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

                                    const size = prop.initializer.end - prop.initializer.pos;
                                    const meanifiedName = meanifiedMap.get(key);
                                    const suffix = meanifiedName ? ` -> ${meanifiedName}` : '';

                                    console.log(`${key} (${size} chars)${suffix}`);
                                    count++;
                                }
                            }
                            console.log(`Total Modules: ${count}`);
                            modulesFound = true;
                        }

                        // Element 2: Entry points (optional)
                        if (mainArray.elements.length >= 3) {
                            const entryArg = mainArray.elements[2];
                            if (ts.isArrayLiteralExpression(entryArg)) {
                                console.log('\n--- Start Module ---');
                                if (entryArg.elements.length > 0) {
                                    const firstEntry = entryArg.elements[0];
                                    if (ts.isArrayLiteralExpression(firstEntry)) {
                                        if (firstEntry.elements.length > 0) {
                                            const entryModule = firstEntry.elements[0];
                                            if (ts.isStringLiteral(entryModule)) {
                                                console.log(entryModule.text);
                                            }
                                        }
                                    } else if (ts.isStringLiteral(firstEntry)) {
                                        console.log(firstEntry.text);
                                    }
                                }
                                entryFound = true;
                            }
                        }
                    }
                }
            }
        }

        if (!modulesFound || !entryFound) {
            ts.forEachChild(node, visit);
        }
    }

    visit(sourceFile);

    if (!modulesFound) {
        console.error('Could not find Webpack modules structure.');
    }
}
