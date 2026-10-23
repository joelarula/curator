# Trilogue: three symmetric agents, no script of who speaks when. Every message goes on the shared "say" bus
# and everybody hears it; the speaker names the next speaker ("to"), and only that agent answers.
# The "floor" list stands in for each agent's brain (in production an LLM `agent` node picks "to" and the text).
# The conversation ends when a message reaches the turn limit.
LIMIT = 6
FLOOR = "['a','c','b','c','a','b','c']"

participant = (me) ->
  msg = "msg_#{me}"
  seq "agent #{me}",
    repeat seq("#{me} listens",
      wait_event "say", msg
      tool "heard", { agent: me, from: "$state.#{msg}.from", text: "$state.#{msg}.text" }
      if_else "$state.#{msg}.to == '#{me}' && $state.#{msg}.n < #{LIMIT}",
        seq "#{me} speaks",
          assign "next_#{me}", "#{FLOOR}[$state.#{msg}.n + 1]"
          emit_event "say", { from: me, to: "$state.next_#{me}", text: "#{me} says", n: "$state.#{msg}.n + 1" }
    ), { name: "participant #{me}", maxIterations: 12, until: "$state.#{msg}.n >= #{LIMIT}" }

parallel "Trilogue",
  participant "a"
  participant "b"
  participant "c"
