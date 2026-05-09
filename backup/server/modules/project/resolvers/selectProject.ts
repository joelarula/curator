import { getProject } from '../projects'
import { ERR_NOT_AUTHENTICATED, ERR_PROJECT_NOT_FOUND } from '../../../errors'

export async function selectProjectMutation(_: any, { id }: { id: number }, context: any) {
    if (!context.user) {
        throw new Error(ERR_NOT_AUTHENTICATED)
    }

    const project = await getProject(id)

    if (!project) {
        throw new Error(ERR_PROJECT_NOT_FOUND)
    }

    // Store selected project in session/context
    if (context.req && context.req.session) {
        context.req.session.currentProjectId = id
    }

    return project
}
