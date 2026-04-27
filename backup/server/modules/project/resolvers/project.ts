import { getProject } from '../projects'
import { ERR_NOT_AUTHENTICATED } from '../../../errors'

export async function project(_: any, { id }: { id: number }, context: any) {
    if (!context.user) {
        throw new Error(ERR_NOT_AUTHENTICATED)
    }

    return await getProject(id)
}
