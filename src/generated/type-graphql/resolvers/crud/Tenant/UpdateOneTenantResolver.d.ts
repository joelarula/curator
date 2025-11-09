import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneTenantArgs } from "./args/UpdateOneTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class UpdateOneTenantResolver {
    updateOneTenant(ctx: any, info: GraphQLResolveInfo, args: UpdateOneTenantArgs): Promise<Tenant | null>;
}
