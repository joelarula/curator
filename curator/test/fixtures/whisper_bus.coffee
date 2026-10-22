# Generic agent: knows only its own name and where to pass things on. It waits for ANY
# message on the shared "whisper" bus, ignores those not addressed to it, and handles the first one that is.
# Conversation state is shared by all agents, so every state key is namespaced by the agent's name.
whisperer = (me, next) ->
  done = "handled_#{me}"
  msg = "msg_#{me}"
  seq "agent #{me}",
    set_state "#{done}": false
    while_loop "!$state.#{done}",
      seq "#{me} inbox",
        wait_event "whisper", msg
        if_else "$state.#{msg}.to == '#{me}'",
          seq "#{me} handles",
            tool "heard", { agent: me, from: "$state.#{msg}.from", text: "$state.#{msg}.text" }
            emit_event "whisper", { from: me, to: next, text: "$state.#{msg}.text" }
            set_state "#{done}": true

# Generic listener: addressed by nobody, hears every whisper on the bus.
listener = (name, hops) ->
  msg = "msg_#{name}"
  repeat seq("#{name} inbox",
    wait_event "whisper", msg
    tool "heard", { agent: name, from: "$state.#{msg}.from", text: "$state.#{msg}.text" }
  ), { name: "listener #{name}", maxIterations: hops }
parallel "Whisper Bus",
  whisperer "a", "b"
  whisperer "b", "c"
  whisperer "c", "a"
  listener "spy", 4
