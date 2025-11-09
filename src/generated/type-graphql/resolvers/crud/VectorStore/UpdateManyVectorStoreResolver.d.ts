import type { GraphQLResolveInfo } from "graphql";
import { UpdateManyVectorStoreArgs } from "./args/UpdateManyVectorStoreArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class UpdateManyVectorStoreResolver {
    updateManyVectorStore(ctx: any, info: GraphQLResolveInfo, args: UpdateManyVectorStoreArgs): Promise<AffectedRowsOutput>;
}
