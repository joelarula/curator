import type { GraphQLResolveInfo } from "graphql";
import { FindManyTenantArgs } from "./args/FindManyTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class FindManyTenantResolver {
    tenants(ctx: any, info: GraphQLResolveInfo, args: FindManyTenantArgs): Promise<Tenant[]>;
}
