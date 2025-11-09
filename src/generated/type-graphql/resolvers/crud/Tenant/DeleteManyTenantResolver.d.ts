import type { GraphQLResolveInfo } from "graphql";
import { DeleteManyTenantArgs } from "./args/DeleteManyTenantArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class DeleteManyTenantResolver {
    deleteManyTenant(ctx: any, info: GraphQLResolveInfo, args: DeleteManyTenantArgs): Promise<AffectedRowsOutput>;
}
