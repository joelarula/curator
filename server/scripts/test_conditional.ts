import { Pipeline } from '../src/services/ast/builder.js';

const flow = new Pipeline();

flow.tool('debug', { message: "Starting conditional test." });

flow.if(true, (trueFlow) => {
    trueFlow.tool('debug', { message: "If evaluated to true!" });
}).else((falseFlow) => {
    falseFlow.tool('debug', { message: "If evaluated to false!" });
});

flow.match('apple', 'apple', (matchFlow) => {
    matchFlow.tool('debug', { message: "Match evaluated to true! apple == apple" });
}).else((elseFlow) => {
    elseFlow.tool('debug', { message: "Match evaluated to false! apple != apple" });
});

export default flow;
