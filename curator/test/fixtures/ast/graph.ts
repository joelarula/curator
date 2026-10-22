import type { CuratorGraphNode } from '../src/engine/CuratorAst.js';

export function run(): CuratorGraphNode {
  return {
    type: 'Curator_Graph',
    name: 'Traffic Light Test Graph',
    startNode: 'RED',
    stateSchema: `interface TrafficState {
      count: number;
      currentColor: string;
      message: string;
    }`,
    nodes: {
      RED: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          let state = {};
          try { state = JSON.parse(input); } catch(e) {}
          
          const count = (state.count || 0) + 1;
          const msg = count > 3 ? 'STOP' : 'Waiting...';
          console.log('RED LIGHT! count:', count);
          
          return JSON.stringify({ count, currentColor: 'RED', message: msg });
        })()`
      },
      GREEN: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('GREEN LIGHT!');
          return JSON.stringify({ currentColor: 'GREEN', message: 'Go!' });
        })()`
      },
      YELLOW: {
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          console.log('YELLOW LIGHT!');
          return JSON.stringify({ currentColor: 'YELLOW', message: 'Slow down!' });
        })()`
      }
    },
    edges: {
      RED: {
        // A conditional router to stop the graph if count > 3
        type: 'Curator_Script',
        language: 'javascript',
        code: `(() => {
          let state = {};
          try { state = JSON.parse(input); } catch(e) {}
          if (state.message === 'STOP') return '__end__';
          return 'GREEN';
        })()`
      },
      GREEN: 'YELLOW',
      YELLOW: 'RED'
    }
  };
}
