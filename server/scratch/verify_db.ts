import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    const latestText = await prisma.text.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { resource: true }
    });

    if (latestText) {
        console.log('--- LATEST TEXT RECORD ---');
        console.log(`Resource: ${latestText.resource.uri}`);
        console.log(`Role: ${latestText.role}`);
        console.log(`Length: ${latestText.content.length}`);
        console.log('Content Start:');
        console.log(latestText.content.substring(0, 500));
    } else {
        console.log('No text records found.');
    }
}

main();
