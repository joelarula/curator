import type { GraphQLResolveInfo } from "graphql";
import { DeleteManyChunkArgs } from "./args/DeleteManyChunkArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class DeleteManyChunkResolver {
    deleteManyChunk(ctx: any, info: GraphQLResolveInfo, args: DeleteManyChunkArgs): Promise<AffectedRowsOutput>;
}
