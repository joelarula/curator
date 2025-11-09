import type { GraphQLResolveInfo } from "graphql";
import { UpdateManyTenantArgs } from "./args/UpdateManyTenantArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class UpdateManyTenantResolver {
    updateManyTenant(ctx: any, info: GraphQLResolveInfo, args: UpdateManyTenantArgs): Promise<AffectedRowsOutput>;
}
