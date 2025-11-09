import type { GraphQLResolveInfo } from "graphql";
import { GroupByTenantArgs } from "./args/GroupByTenantArgs";
import { TenantGroupBy } from "../../outputs/TenantGroupBy";
export declare class GroupByTenantResolver {
    groupByTenant(ctx: any, info: GraphQLResolveInfo, args: GroupByTenantArgs): Promise<TenantGroupBy[]>;
}
