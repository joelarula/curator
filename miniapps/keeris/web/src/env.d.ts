/// <reference types="vite/client" />

// Vite ?raw imports for .graphql SDL files
declare module '*.graphql?raw' {
  const content: string;
  export default content;
}

// Plain .graphql imports (without ?raw) return the SDL string as default
declare module '*.graphql' {
  const content: string;
  export default content;
}
