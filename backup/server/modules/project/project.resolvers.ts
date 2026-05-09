import { projects } from './resolvers/projects'
import { project } from './resolvers/project'
import { createProjectMutation } from './resolvers/createProject'
import { deleteProjectMutation } from './resolvers/deleteProject'
import { selectProjectMutation } from './resolvers/selectProject'
import { uploadFiles } from './resolvers/uploadFiles'

export const projectResolvers = {
    Query: {
        projects,
        project
    },
    Mutation: {
        createProject: createProjectMutation,
        deleteProject: deleteProjectMutation,
        selectProject: selectProjectMutation,
        uploadFiles
    }
}
