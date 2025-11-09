import { TenantCountProjectsArgs } from "./args/TenantCountProjectsArgs";
export declare class TenantCount {
    projects: number;
    getProjects(root: TenantCount, args: TenantCountProjectsArgs): number;
}
