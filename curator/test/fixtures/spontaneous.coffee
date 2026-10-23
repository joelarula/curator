# Spontaneous dialogue: nobody is told to open, nobody is addressed, nobody arbitrates. Each agent listens on
# the shared "say" bus with its own patience (timeoutSeconds). The most impatient agent (a) speaks up first
# on its own. The others react to what they hear and may answer at the same moment; all messages stand.
participant = (me, patience, answersTo) ->
  msg = "msg_#{me}"
  repeat seq("#{me} listens",
    set_state "#{msg}": null
    wait_event "say", msg, { timeoutSeconds: patience }
    if_else "$state.#{msg}",
      seq "#{me} reacts",
        tool "heard", { agent: me, from: "$state.#{msg}.from" }
        if_else "$state.#{msg}.from == '#{answersTo}'",
          seq "#{me} answers",
            tool "spoke", { agent: me, kind: "answer" }
            emit_event "say", { from: me }
      seq "#{me} speaks up",
        tool "spoke", { agent: me, kind: "opener" }
        emit_event "say", { from: me }
  ), { name: "participant #{me}", maxIterations: 3 }

parallel "Spontaneous",
  participant "a", 10, "nobody"
  participant "b", 60, "a"
  participant "c", 60, "a"
