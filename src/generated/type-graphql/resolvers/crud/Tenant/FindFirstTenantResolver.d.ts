import type { GraphQLResolveInfo } from "graphql";
import { FindFirstTenantArgs } from "./args/FindFirstTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class FindFirstTenantResolver {
    findFirstTenant(ctx: any, info: GraphQLResolveInfo, args: FindFirstTenantArgs): Promise<Tenant | null>;
}
