export const chromium = {
  launch: async () => { 
    throw new Error("Playwright standard launch not available in extension. Use extension popup tab execution."); 
  },
  connectOverCDP: async () => { 
    throw new Error("CDP not available in extension worker."); 
  }
};

export default {
  chromium
};
