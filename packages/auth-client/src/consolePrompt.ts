import type { AuthPrompt, AuthorizationInfo, VerificationInfo } from './types.js';

/** Plain-terminal AuthPrompt: prints the verification link and code to stderr. */
export function createConsolePrompt(options: { signal?: AbortSignal; write?: (line: string) => void } = {}): AuthPrompt {
  const write = options.write ?? ((line: string) => process.stderr.write(`${line}\n`));
  return {
    signal: options.signal,
    status: (message) => write(`\x1b[90m[auth] ${message}\x1b[0m`),
    showVerification(info: VerificationInfo) {
      const target = info.service ? ` for "${info.service}"` : '';
      write('');
      write(`\x1b[1m[auth] Sign in to ${info.idp}${target}\x1b[0m`);
      write(`  Open:  \x1b[36m${info.verificationUriComplete ?? info.verificationUri}\x1b[0m`);
      write(`  Code:  \x1b[1m\x1b[33m${info.userCode}\x1b[0m   (expires in ${Math.round(info.expiresIn / 60)} min)`);
      write('');
    },
    showAuthorization(info: AuthorizationInfo) {
      const target = info.service ? ` for "${info.service}"` : '';
      write('');
      write(`\x1b[1m[auth] Sign in to ${info.idp}${target}\x1b[0m`);
      write(`  Open:  \x1b[36m${info.authorizationUrl}\x1b[0m`);
      write(`  \x1b[90mWaiting for the browser to return to ${info.redirectUri}\x1b[0m`);
      write('');
    },
  };
}
