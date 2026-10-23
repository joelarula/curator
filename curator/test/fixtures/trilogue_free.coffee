# Free-for-all trilogue: nobody is told who speaks next. After every message, each agent that heard it
# bids for the floor through the atomic "claim" tool; the first claim for that turn wins and speaks,
# the others stay silent and keep listening. Ends when a message reaches the turn limit.
LIMIT = 6

participant = (me) ->
  msg = "msg_#{me}"
  bid = "bid_#{me}"
  repeat seq("#{me} listens",
    wait_event "say", msg
    tool "heard", { agent: me, from: "$state.#{msg}.from", turn: "$state.#{msg}.n" }
    if_else "$state.#{msg}.n < #{LIMIT}",
      seq "#{me} bids",
        tool "claim", { turn: "$state.#{msg}.n", me: me }, bid
        if_else "$context.#{bid} == 'won'",
          emit_event "say", { from: me, text: "#{me} speaks", n: "$state.#{msg}.n + 1" }
  ), { name: "participant #{me}", maxIterations: 12, until: "$state.#{msg}.n >= #{LIMIT}" }

parallel "Free Trilogue",
  participant "a"
  participant "b"
  participant "c"
