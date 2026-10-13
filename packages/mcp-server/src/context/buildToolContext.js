export async function buildToolContext(options) {
    const { prisma, host } = options;
    let userId = 1;
    let projectId = 1;
    let conversationId = 1;
    if (prisma?.user) {
        try {
            const user = await prisma.user.findFirst({
                where: { email: 'system@local' },
            });
            if (user) {
                userId = user.id;
            }
            const project = await prisma.project.findFirst({
                where: { id: '1' },
            });
            if (project) {
                projectId = project.id;
            }
            if (user && project && prisma.conversation) {
                let conv = await prisma.conversation.findFirst({
                    where: { userId: user.id, projectId: project.id },
                });
                if (!conv) {
                    conv = await prisma.conversation.create({
                        data: { userId: user.id, projectId: project.id },
                    });
                }
                conversationId = conv.id;
            }
        }
        catch (_) { }
    }
    return {
        userId,
        projectId,
        conversationId,
        prisma,
        host,
    };
}
//# sourceMappingURL=buildToolContext.js.map