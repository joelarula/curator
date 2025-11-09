import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueTenantOrThrowArgs } from "./args/FindUniqueTenantOrThrowArgs";
import { Tenant } from "../../../models/Tenant";
export declare class FindUniqueTenantOrThrowResolver {
    getTenant(ctx: any, info: GraphQLResolveInfo, args: FindUniqueTenantOrThrowArgs): Promise<Tenant | null>;
}
