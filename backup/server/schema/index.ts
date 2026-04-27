import { userTypeDefs } from '../modules/user/user.schema'
import { projectTypeDefs } from '../modules/project/project.schema'
import { consultantTypeDefs } from '../modules/consultant/consultant.schema'

export const typeDefs = `#graphql
  ${userTypeDefs}
  ${consultantTypeDefs}
  ${projectTypeDefs}

  type Query
  type Mutation
`
