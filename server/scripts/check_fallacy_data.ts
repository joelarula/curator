import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';
const { Pool } = pkg;
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
    const connectionString = process.env.DATABASE_URL!;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool as any);
    const prisma = new PrismaClient({ adapter });

    try {
        const fallacy = await prisma.resource.findFirst({
            where: {
                uri: "https://www.logicallyfallacious.com/logicalfallacies/Appeal-to-Self-evident-Truth"
            },
            include: {
                texts: true
            }
        });

        if (fallacy) {
            const mainText = fallacy.texts.find(t => t.role === 'MAIN');
            if (mainText) {
                console.log(`--- Appeal-to-Self-evident-Truth MAIN Text (Length: ${mainText.content.length}) ---`);
                console.log(mainText.content);
            }
        }
    } catch (e: any) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
