export const example_workflow = {
    type: 'Curator_Sequential',
    name: 'example_workflow',
    subAgents: [
        {
            type: 'Curator_Script',
            language: 'javascript',
            code: `(() => {
        console.log('🔄 Reusable Workflow: Step 1 executing...');
        return JSON.stringify({ reusableStep1: 'success' });
      })()`
        },
        {
            type: 'Curator_Script',
            language: 'javascript',
            code: `(() => {
        console.log('🔄 Reusable Workflow: Step 2 executing...');
        return JSON.stringify({ reusableStep2: 'success' });
      })()`
        }
    ]
};
//# sourceMappingURL=example_workflow.js.map