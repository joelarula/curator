const fs = require('fs');
let text = fs.readFileSync('src/engine/CuratorAst.ts', 'utf8');

text = text.replace(/export interface Curator([A-Za-z0-9]+)Node \{/g, 'export interface Curator$1Node extends CuratorBaseNode {');
text = `export interface CuratorBaseNode {
  exclude_from_history?: boolean;
}

` + text;

fs.writeFileSync('src/engine/CuratorAst.ts', text);
console.log('Done!');
