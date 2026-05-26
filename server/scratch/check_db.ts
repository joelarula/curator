import { PrismaClient } from '@prisma/client';
import { provisionSqliteDb } from '../src/bin/sqliteProvisioner.js';

async function main() {
    // Connect to mydb SQLite database
    const prisma = await provisionSqliteDb('mydb', false);
    const requests = await prisma.request.findMany({
        orderBy: { id: 'desc' },
        take: 5
    });
    for (const req of requests) {
        console.log(`Request ID: ${req.id}`);
        console.log(`ToolName: ${req.toolName}`);
        console.log(`Status: ${req.status}`);
        console.log(`AST:`, JSON.stringify(req.ast, null, 2));
        console.log('====================================');
    }
}
main();
