export const promises = {
  readFile: async () => '',
  writeFile: async () => {},
  mkdir: async () => {},
  access: async () => {}
};

export const existsSync = () => false;
export const readFileSync = () => '';
export const writeFileSync = () => {};

export default {
  promises,
  existsSync,
  readFileSync,
  writeFileSync
};
