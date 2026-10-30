/** Error returned by an OAuth endpoint (`error` / `error_description`). */
export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    description?: string,
    public readonly status?: number
  ) {
    super(description ? `${code}: ${description}` : code);
    this.name = 'OAuthError';
  }
}

/** No usable token for a service; an interactive `/auth login` is needed. */
export class AuthRequiredError extends Error {
  public readonly code = 'AUTH_REQUIRED';

  constructor(
    public readonly service: string,
    public readonly idp?: string
  ) {
    super(`Authentication required for "${service}"${idp ? ` (IdP "${idp}")` : ''}. Run /auth login ${service}`);
    this.name = 'AuthRequiredError';
  }
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}
