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

  type RagResponse {
    answer: String!
    sources: [ConsultResult!]!
  }

  type Query {
    me: User
    consult(query: String!): [ConsultResult!]!
    ragAgent(query: String!): RagResponse!
  }

  input FileInput {
    name: String!
    content: String!
    mimeType: String!
    size: Int!
  }

  type UploadResult {
    success: Boolean!
    message: String!
    fileIds: [String!]!
    results: [ConsultResult!]
  }

  type Mutation {
    logout: Boolean!
    uploadFiles(files: [FileInput!]!, projectId: Int, description: String, query: String): UploadResult!
  }
`
