import type { GraphQLResolveInfo } from "graphql";
import { UpsertOneTenantArgs } from "./args/UpsertOneTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class UpsertOneTenantResolver {
    upsertOneTenant(ctx: any, info: GraphQLResolveInfo, args: UpsertOneTenantArgs): Promise<Tenant>;
}
