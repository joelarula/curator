import type { GraphQLResolveInfo } from "graphql";
import { DeleteManyFileDataArgs } from "./args/DeleteManyFileDataArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class DeleteManyFileDataResolver {
    deleteManyFileData(ctx: any, info: GraphQLResolveInfo, args: DeleteManyFileDataArgs): Promise<AffectedRowsOutput>;
}
