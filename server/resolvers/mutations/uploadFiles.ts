import { save as saveService, consult as consultService } from '../../service'
import { GraphQLError } from 'graphql'
import crypto from 'crypto'

export const uploadFiles = async (
  _: any,
  { files, projectId, description, query }: {
    files: Array<{ name: string, content: string, mimeType: string, size: number }>,
    projectId: number,
    description?: string,
    query?: string
  },
  context: any
) => {
  if (!context.user) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' }
    })
  }

  if (!files || files.length === 0) {
    throw new GraphQLError('At least one file is required', {
      extensions: { code: 'BAD_REQUEST' }
    })
  }

  try {
    const savedFiles = []
    for (const file of files) {
      const contentBuffer = Buffer.from(file.content, 'base64')
      const hash = crypto.createHash('sha256').update(contentBuffer).digest('hex')
      
      const fileData = {
        name: file.name,
        content: file.content,
        hash,
        size: file.size,
        mimeType: file.mimeType,
        source: description || 'web_upload',
        projectId: projectId || 1 // Default to project 1 if not specified
      }

      const savedFile = await saveService(fileData as any)
      savedFiles.push(savedFile)
    }

    let searchResults = null
    if (query && query.trim()) {
      const results = await consultService(query)
      searchResults = results.map((result: any) => ({
        content: result.content || result.pageContent || result.text,
        score: result.score || 0,
        metadata: result.metadata || {}
      }))
    }

    return {
      success: true,
      message: `Successfully uploaded ${savedFiles.length} file(s)`,
      fileIds: savedFiles.map(f => f.id),
      results: searchResults
    }
  } catch (error) {
    console.error('Error in uploadFiles resolver:', error)
    throw new GraphQLError('Failed to upload files', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' }
    })
  }
}
