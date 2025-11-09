import type { GraphQLResolveInfo } from "graphql";
import { UpsertOneDocumentArgs } from "./args/UpsertOneDocumentArgs";
import { Document } from "../../../models/Document";
export declare class UpsertOneDocumentResolver {
    upsertOneDocument(ctx: any, info: GraphQLResolveInfo, args: UpsertOneDocumentArgs): Promise<Document>;
}
