import type { GraphQLResolveInfo } from "graphql";
import { DeleteManyDocumentArgs } from "./args/DeleteManyDocumentArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class DeleteManyDocumentResolver {
    deleteManyDocument(ctx: any, info: GraphQLResolveInfo, args: DeleteManyDocumentArgs): Promise<AffectedRowsOutput>;
}
