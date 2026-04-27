export const consultantTypeDefs = `#graphql
  type ConsultResult {
    content: String!
    score: Float!
    metadata: ResultMetadata
  }

  type ResultMetadata {
    fileId: String
    projectId: Int
  }

  type RagResponse {
    answer: String!
    sources: [ConsultResult!]!
    suggestedProjects: [Project!]
  }

  extend type Query {
    consult(query: String!, projectId: Int): [ConsultResult!]!
    ragAgent(query: String!, projectId: Int): RagResponse!
  }
`
