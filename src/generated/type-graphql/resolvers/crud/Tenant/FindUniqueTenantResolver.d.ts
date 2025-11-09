import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueTenantArgs } from "./args/FindUniqueTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class FindUniqueTenantResolver {
    tenant(ctx: any, info: GraphQLResolveInfo, args: FindUniqueTenantArgs): Promise<Tenant | null>;
}
