export const projectTypeDefs = `#graphql
  type Project {
    id: Int!
    name: String!
    accountId: Int!
    fileCount: Int!
    createdAt: String!
    updatedAt: String!
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

  extend type Query {
    projects: [Project!]!
    project(id: Int!): Project
  }

  extend type Mutation {
    createProject(name: String!): Project!
    deleteProject(id: Int!): Boolean!
    selectProject(id: Int!): Project!
    uploadFiles(files: [FileInput!]!, projectId: Int, description: String, query: String): UploadResult!
  }
`
