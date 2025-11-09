import type { GraphQLResolveInfo } from "graphql";
import { CreateManyTenantArgs } from "./args/CreateManyTenantArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class CreateManyTenantResolver {
    createManyTenant(ctx: any, info: GraphQLResolveInfo, args: CreateManyTenantArgs): Promise<AffectedRowsOutput>;
}
