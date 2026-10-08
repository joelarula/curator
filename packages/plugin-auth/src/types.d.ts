export interface CuratorRole {
    id: string;
    name: string;
    description?: string | null;
}
export interface CuratorAuthUser {
    id: string;
    email: string;
    name?: string | null;
    googleId?: string | null;
    roles: string[];
}
export declare const CURATOR_ROLES: {
    readonly MANAGER: "curator_manager";
    readonly ADMIN: "curator_admin";
    readonly USER: "curator_user";
};
export interface CuratorAuthOptions {
    jwtSecret?: string;
    defaultManagers?: string[];
    googleClientId?: string;
    googleClientSecret?: string;
    googleCallbackUrl?: string;
    frontendUrl?: string;
    getPrisma?: () => any;
}
//# sourceMappingURL=types.d.ts.map