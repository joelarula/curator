import type { GraphQLResolveInfo } from "graphql";
import { UpdateManyChunkArgs } from "./args/UpdateManyChunkArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class UpdateManyChunkResolver {
    updateManyChunk(ctx: any, info: GraphQLResolveInfo, args: UpdateManyChunkArgs): Promise<AffectedRowsOutput>;
}
