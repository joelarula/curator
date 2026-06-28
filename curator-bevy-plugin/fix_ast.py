import re

with open('src/ast.rs', 'r') as f:
    content = f.read()

content = content.replace("#[serde(bound='')]", '#[serde(bound="")]')

with open('src/ast.rs', 'w') as f:
    f.write(content)
