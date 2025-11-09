import type { GraphQLResolveInfo } from "graphql";
import { UpdateManyDocumentArgs } from "./args/UpdateManyDocumentArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class UpdateManyDocumentResolver {
    updateManyDocument(ctx: any, info: GraphQLResolveInfo, args: UpdateManyDocumentArgs): Promise<AffectedRowsOutput>;
}
