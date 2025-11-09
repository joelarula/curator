import type { GraphQLResolveInfo } from "graphql";
import { DeleteManyModelArgs } from "./args/DeleteManyModelArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class DeleteManyModelResolver {
    deleteManyModel(ctx: any, info: GraphQLResolveInfo, args: DeleteManyModelArgs): Promise<AffectedRowsOutput>;
}
