import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneTenantArgs } from "./args/DeleteOneTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class DeleteOneTenantResolver {
    deleteOneTenant(ctx: any, info: GraphQLResolveInfo, args: DeleteOneTenantArgs): Promise<Tenant | null>;
}
