# Spontaneous trilogue with real text on the shared "say" bus. Nobody is told to open: a is the most impatient and
# speaks up after 10s. b and c answer a at the same moment; a follows up when it hears c.
participant = (me, patience, answersTo, opener, answer, rounds) ->
  repeat seq("#{me} listens",
    set_state "msg_#{me}": null
    wait_event "say", "msg_#{me}", { timeoutSeconds: patience }
    if_else "$state.msg_#{me}",
      seq "#{me} reacts",
        if_else "$state.msg_#{me}.from == '#{answersTo}'",
          emit_event "say", { from: me, text: answer }
      emit_event "say", { from: me, text: opener }
  ), { name: "participant #{me}", maxIterations: rounds }

parallel "Spontaneous trilogue",
  participant "a", 10, "c", "Does anyone know a good name for our project?", "Curator is fine by me, then.", 3
  participant "b", 60, "a", "", "How about Curator?", 1
  participant "c", 60, "a", "", "I would pick Atlas.", 1
