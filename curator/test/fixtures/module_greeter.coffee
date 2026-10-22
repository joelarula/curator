define_module "greeter",
  main: seq "main",
    call "#double", { n: 21 }, { as: "result" }
    tool "record", { value: "$state.result" }
  subroutines:
    double: sub { n: { type: "number" } },
      seq("doubleBody",
        assign "doubled", "$params.n * 2"
      ),
      "$state.doubled"
