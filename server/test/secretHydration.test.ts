import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecretService } from '../src/services/SecretService.js';
import { AgentRoleService } from '../src/services/AgentRoleService.js';
import { CuratorBuilder, coffeeAstVerbs } from '../../curator/dist/src/index.js';

describe('Curator Architecture - Secret Placeholders & Late-Binding Safe Context', () => {

    beforeEach(() => {
        SecretService.clearMemorySecrets();
    });

    describe('1. AES-256-GCM Encryption & Decryption', () => {
        it('should correctly encrypt and decrypt secrets without data corruption', () => {
            const rawToken = 'ghp_SampleGitHubSecretToken_9876543210ABCDEF';
            const encrypted = SecretService.encrypt(rawToken);

            expect(encrypted.ciphertext).toBeDefined();
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.tag).toBeDefined();
            expect(encrypted.ciphertext).not.toBe(rawToken);

            const decrypted = SecretService.decrypt(encrypted);
            expect(decrypted).toBe(rawToken);
        });
    });

    describe('2. Secret Resolution & Scoping', () => {
        it('should resolve secrets from in-memory project registry with fallback', async () => {
            SecretService.registerSecret('STRIPE_KEY', 'sk_live_1234567890abcdef', 'proj-101');
            SecretService.registerSecret('DEFAULT_KEY', 'default-value');

            // Scoped resolution
            const scoped = await SecretService.resolveSecret('STRIPE_KEY', { projectId: 'proj-101' });
            expect(scoped).toBe('sk_live_1234567890abcdef');

            // Global fallback
            const globalVal = await SecretService.resolveSecret('DEFAULT_KEY');
            expect(globalVal).toBe('default-value');
        });

        it('should fallback to process.env if not in database or memory', async () => {
            process.env.TEST_API_TOKEN = 'secret_env_token_999';
            const resolved = await SecretService.resolveSecret('TEST_API_TOKEN');
            expect(resolved).toBe('secret_env_token_999');
            delete process.env.TEST_API_TOKEN;
        });
    });

    describe('3. Placeholder Detection & Late-Binding Hydration', () => {
        it('should recognize all canonical placeholder variations', () => {
            expect(SecretService.hasPlaceholder('$secret:GITHUB_TOKEN')).toBe(true);
            expect(SecretService.hasPlaceholder('Bearer $secret:GITHUB_TOKEN')).toBe(true);
            expect(SecretService.hasPlaceholder('{{secrets.STRIPE_KEY}}')).toBe(true);
            expect(SecretService.hasPlaceholder('secret://MY_VAULT_KEY')).toBe(true);
            expect(SecretService.hasPlaceholder('regular_string_with_no_secret')).toBe(false);
            expect(SecretService.hasPlaceholder({ apiKey: '$secret:OPENAI_KEY' })).toBe(true);
        });

        it('should hydrate placeholders deep in objects and arrays with raw values in safe context', async () => {
            SecretService.registerSecret('GH_TOKEN', 'ghp_real_raw_token_xyz_12345678');
            SecretService.registerSecret('DB_PASSWORD', 'SuperSecretPass#99');

            const toolInputArgs = {
                repo: 'joelarula/curator',
                auth: {
                    type: 'bearer',
                    token: '$secret:GH_TOKEN',
                    header: 'Bearer $secret:GH_TOKEN'
                },
                tags: ['git', '{{secrets.GH_TOKEN}}'],
                db: {
                    connStr: 'postgres://user:$secret:DB_PASSWORD@localhost:5432/curator'
                }
            };

            const { hydrated, secretsMap } = await SecretService.hydrate(toolInputArgs);

            // Raw values are injected into hydrated payload
            expect(hydrated.auth.token).toBe('ghp_real_raw_token_xyz_12345678');
            expect(hydrated.auth.header).toBe('Bearer ghp_real_raw_token_xyz_12345678');
            expect(hydrated.tags[1]).toBe('ghp_real_raw_token_xyz_12345678');
            expect(hydrated.db.connStr).toBe('postgres://user:SuperSecretPass#99@localhost:5432/curator');

            // Original object is untouched (immutability)
            expect(toolInputArgs.auth.token).toBe('$secret:GH_TOKEN');

            // Secrets map tracks hydrated raw values for egress scrubbing
            expect(secretsMap.has('ghp_real_raw_token_xyz_12345678')).toBe(true);
            expect(secretsMap.get('ghp_real_raw_token_xyz_12345678')).toBe('GH_TOKEN');
            expect(secretsMap.has('SuperSecretPass#99')).toBe(true);
            expect(secretsMap.get('SuperSecretPass#99')).toBe('DB_PASSWORD');
        });
    });

    describe('4. Egress Sanitization & Redaction (Masking)', () => {
        it('should redact raw secrets from output strings and error messages', () => {
            const secretsMap = new Map<string, string>([
                ['ghp_real_raw_token_xyz_12345678', 'GH_TOKEN'],
                ['SuperSecretPass#99', 'DB_PASSWORD']
            ]);

            const externalApiError = 'HTTP 401 Unauthorized: Failed request with token ghp_real_raw_token_xyz_12345678 and pass SuperSecretPass#99';
            const masked = SecretService.mask(externalApiError, secretsMap);

            expect(masked).not.toContain('ghp_real_raw_token_xyz_12345678');
            expect(masked).not.toContain('SuperSecretPass#99');
            expect(masked).toBe('HTTP 401 Unauthorized: Failed request with token [REDACTED:GH_TOKEN] and pass [REDACTED:DB_PASSWORD]');
        });

        it('should scrub generic tokens as defense-in-depth even if not in map', () => {
            const rawEcho = 'Echoed GitHub token: ghp_111122223333444455556666777788889999 and OpenAI key: sk-abcdefghijklmnopqrstuvwxyz123456';
            const scrubbed = SecretService.mask(rawEcho);

            expect(scrubbed).not.toContain('ghp_111122223333444455556666777788889999');
            expect(scrubbed).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
            expect(scrubbed).toContain('[REDACTED:GITHUB_TOKEN]');
            expect(scrubbed).toContain('[REDACTED:API_KEY]');
        });
    });

    describe('5. Agent RBAC Permission Validation', () => {
        it('should DENY secret hydration if an agent has no roles assigned', async () => {
            SecretService.registerSecret('AWS_SECRET_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

            const mockPrisma: any = {
                agent: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 10,
                        name: 'UntrustedAgent',
                        roles: []
                    })
                }
            };

            await expect(SecretService.hydrate({ key: '$secret:AWS_SECRET_KEY' }, {
                agentId: 10,
                prisma: mockPrisma
            })).rejects.toThrow('Access Denied: Agent \'UntrustedAgent\' has no assigned roles');
        });

        it('should ALLOW secret hydration if agent has explicit permission or admin role', async () => {
            SecretService.registerSecret('AWS_SECRET_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');

            const mockPrismaAdmin: any = {
                agent: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 20,
                        name: 'AdminAgent',
                        roles: [
                            { role: { name: 'agent:admin', permissions: [] } }
                        ]
                    })
                }
            };

            const result = await SecretService.hydrate({ key: '$secret:AWS_SECRET_KEY' }, {
                agentId: 20,
                prisma: mockPrismaAdmin
            });

            expect(result.hydrated.key).toBe('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
        });
    });

    describe('6. DSL & Builder Integration', () => {
        it('CuratorBuilder.secret generates safe placeholder string', () => {
            const ph = CuratorBuilder.secret('STRIPE_SECRET_KEY');
            expect(ph).toBe('$secret:STRIPE_SECRET_KEY');
        });

        it('coffeeAstVerbs.secret exposes verb for CoffeeScript workflows', () => {
            const verbResult = coffeeAstVerbs.secret('GITHUB_TOKEN');
            expect(verbResult).toBe('$secret:GITHUB_TOKEN');
        });
    });
});
