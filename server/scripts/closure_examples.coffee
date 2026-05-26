

# ==========================================
# Example 3: Closure in a Pipeline / AST Builder Context
# ==========================================
run: |
  flow = new Flow()
  
  # Closure factory to create standardized LLM tasks
  createAnalystPrompt = (roleName) ->
    # 'roleName' is captured in the closure
    return (dataToAnalyze) ->
      flow.tool "ask_llm",
        prompt: """
          You are a high-fidelity #{roleName}.
          Please analyze the following data:
          #{dataToAnalyze}
        """

  # Create specific closures for different tasks
  askWeatherAnalyst = createAnalystPrompt("Weather Analyst")
  askFinancialAnalyst = createAnalystPrompt("Financial Analyst")
  
  # Simulate fetching data
  feedData = "{{toolOutputs.process_feed.items}}"
  
  # Use the closures
  weatherResult = askWeatherAnalyst(feedData)
  financeResult = askFinancialAnalyst(feedData)
  
  flow.toAST()
