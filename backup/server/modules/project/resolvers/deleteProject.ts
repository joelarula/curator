import { deleteProject } from '../projects'
import { ERR_NOT_AUTHENTICATED } from '../../../errors'

export async function deleteProjectMutation(_: any, { id }: { id: number }, context: any) {
    if (!context.user) {
        throw new Error(ERR_NOT_AUTHENTICATED)
    }

    return await deleteProject(id)
}
