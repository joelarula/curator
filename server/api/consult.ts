import { consult } from '../../src/service'
import { defineEventHandler, getQuery, createError } from 'h3'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const queryString = query.query as string

    if (!queryString) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Query parameter is required',
        })
    }

    try {
        const results = await consult(queryString)
        return results
        // return { message: "Hello from consult API" }
    } catch (error) {
        console.error('Error in consult API:', error)
        throw createError({
            statusCode: 500,
            statusMessage: `Internal Server Error: ${error}`,
        })
    }
})
