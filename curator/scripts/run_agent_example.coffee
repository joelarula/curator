# run_agent_example.coffee
# CoffeeScript equivalent of run_agent_example.ts
# Uses ADK Agent + FunctionTool, persists session/events via PrismaSessionService

import { Agent, FunctionTool } from '@google/adk'
import { executeAgent } from '../src/index.js'

export run = ({ prisma, dbName }) ->
  console.log "[Script] Executing agent script using database: #{dbName}"

  # 1. Define a simple math tool
  calculatorTool = new FunctionTool
    name: 'calculate_square'
    description: 'Calculate the square of a number.'
    execute: (args) ->
      result = args.value * args.value
      console.log "[Tool Executed] calculate_square: #{args.value} -> #{result}"
      { result }
    parameters:
      type: 'object'
      properties:
        value: { type: 'number' }
      required: ['value']

  # 2. Define the ADK agent
  agent = new Agent
    name: 'math_agent'
    model: 'gemini-2.5-flash'
    instruction: '''
      You are a math helper. You must ALWAYS use the calculate_square tool
      to find the square of a number. Do not calculate it yourself.
    '''
    tools: [calculatorTool]

  # 3. Run the agent
  prompt    = 'Calculate the square of 17. Use the tool.'
  sessionId = 'test_math_session_coffee'
  userId    = 'default_user'

  console.log "[Script] Running agent with prompt: \"#{prompt}\""

  answer = await executeAgent { prisma, agent, prompt, userId, sessionId }

  console.log "[Script] Final Agent Answer:\n", answer

  # 4. Audit ADK persistence tables
  console.log "\n[Script] Auditing ADK persistence tables..."

  sessions = await prisma.adkSession.findMany
    where: { userId }
    include: { events: true }

  console.log "\n=================== ADK PERSISTENCE AUDIT ==================="
  console.log "Sessions found: #{sessions.length}"

  for session from sessions
    console.log "\n[Session] id=#{session.id} app=#{session.appName} user=#{session.userId}"
    console.log "  State:", JSON.stringify session.state
    console.log "  Events (#{session.events.length}):"
    for ev from session.events
      data = ev.eventData
      author = data?.author ? '?'
      console.log "    [Event] id=#{ev.id} invocation=#{ev.invocationId} author=#{author}"
      if data?.content
        console.log "      Content:", JSON.stringify(data.content).substring 0, 120

  console.log "\n=============================================================\n"
