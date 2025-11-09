import type { GraphQLResolveInfo } from "graphql";
import { Project } from "../../../models/Project";
import { Tenant } from "../../../models/Tenant";
import { TenantProjectsArgs } from "./args/TenantProjectsArgs";
export declare class TenantRelationsResolver {
    projects(tenant: Tenant, ctx: any, info: GraphQLResolveInfo, args: TenantProjectsArgs): Promise<Project[]>;
}
