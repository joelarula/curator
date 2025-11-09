import type { GraphQLResolveInfo } from "graphql";
import { CreateManyDocumentArgs } from "./args/CreateManyDocumentArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class CreateManyDocumentResolver {
    createManyDocument(ctx: any, info: GraphQLResolveInfo, args: CreateManyDocumentArgs): Promise<AffectedRowsOutput>;
}
