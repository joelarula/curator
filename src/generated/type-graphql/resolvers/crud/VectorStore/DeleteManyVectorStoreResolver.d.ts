import type { GraphQLResolveInfo } from "graphql";
import { DeleteManyVectorStoreArgs } from "./args/DeleteManyVectorStoreArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class DeleteManyVectorStoreResolver {
    deleteManyVectorStore(ctx: any, info: GraphQLResolveInfo, args: DeleteManyVectorStoreArgs): Promise<AffectedRowsOutput>;
}
