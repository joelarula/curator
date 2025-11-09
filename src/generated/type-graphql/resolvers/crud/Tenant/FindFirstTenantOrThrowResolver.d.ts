import type { GraphQLResolveInfo } from "graphql";
import { FindFirstTenantOrThrowArgs } from "./args/FindFirstTenantOrThrowArgs";
import { Tenant } from "../../../models/Tenant";
export declare class FindFirstTenantOrThrowResolver {
    findFirstTenantOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstTenantOrThrowArgs): Promise<Tenant | null>;
}
