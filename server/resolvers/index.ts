import { me } from './queries/me'
import { consult } from './queries/consult'
import { ragAgent } from './queries/ragAgent'
import { logout } from './mutations/logout'
import { uploadFiles } from './mutations/uploadFiles'

export const resolvers = {
  Query: {
    me,
    consult,
    ragAgent
  },
  Mutation: {
    logout,
    uploadFiles
  }
}
