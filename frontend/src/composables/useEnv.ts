export const isExtensionContext = (): boolean => {
  return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.sendMessage;
};
