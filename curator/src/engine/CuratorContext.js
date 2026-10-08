import { AsyncLocalStorage } from 'node:async_hooks';
class CuratorContextManager {
    storage = new AsyncLocalStorage();
    run(context, callback) {
        return this.storage.run(context, callback);
    }
    getContext() {
        const context = this.storage.getStore();
        if (!context) {
            throw new Error('CuratorContext is not available in the current asynchronous execution flow.');
        }
        return context;
    }
    tryGetContext() {
        return this.storage.getStore();
    }
}
// Export the singleton instance
export const curatorContext = new CuratorContextManager();
//# sourceMappingURL=CuratorContext.js.map