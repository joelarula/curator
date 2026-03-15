export const userTypeDefs = `#graphql
  type User {
    id: String!
    email: String!
    name: String
  }

  type Account {
    id: Int!
    name: String!
  }

  type Role {
    id: Int!
    name: String!
  }

  extend type Query {
    me: User
  }

  extend type Mutation {
    logout: Boolean!
  }
`
