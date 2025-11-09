import type { GraphQLResolveInfo } from "graphql";
import { UpdateManyModelArgs } from "./args/UpdateManyModelArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class UpdateManyModelResolver {
    updateManyModel(ctx: any, info: GraphQLResolveInfo, args: UpdateManyModelArgs): Promise<AffectedRowsOutput>;
}
