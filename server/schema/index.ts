export const typeDefs = `#graphql
  type User {
    id: String!
    email: String!
    name: String
  }

  type ConsultResult {
    content: String!
    score: Float!
    metadata: ResultMetadata
  }

  type ResultMetadata {
    fileId: String
  }

  type Query {
    me: User
    consult(query: String!): [ConsultResult!]!
  }

  type Mutation {
    logout: Boolean!
  }
`
