import type { GraphQLResolveInfo } from "graphql";
import { UpdateOneDocumentArgs } from "./args/UpdateOneDocumentArgs";
import { Document } from "../../../models/Document";
export declare class UpdateOneDocumentResolver {
    updateOneDocument(ctx: any, info: GraphQLResolveInfo, args: UpdateOneDocumentArgs): Promise<Document | null>;
}
