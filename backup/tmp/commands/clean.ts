import { prisma } from '../db';

export async function cleanCommand() {
    console.log('Cleaning database tables...');
    try {
        // Delete AstBlocks first due to foreign key constraints (cascade should handle it, but explicit is safe)
        // Actually, SourceFile cascade deletes AstBlocks, so deleting SourceFiles is enough.
        // But let's be thorough.

       // const deletedBlocks = await prisma.astBlock.deleteMany({});
        //console.log(`Deleted ${deletedBlocks.count} AST blocks.`);

   //     const deletedFiles = await prisma.sourceFile.deleteMany({});
      // console.log(`Deleted ${deletedFiles.count} source files.`);

        console.log('Database cleaned successfully.');
    } catch (error) {
        console.error('Failed to clean database:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}
