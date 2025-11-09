import type { GraphQLResolveInfo } from "graphql";
import { DeleteOneDocumentArgs } from "./args/DeleteOneDocumentArgs";
import { Document } from "../../../models/Document";
export declare class DeleteOneDocumentResolver {
    deleteOneDocument(ctx: any, info: GraphQLResolveInfo, args: DeleteOneDocumentArgs): Promise<Document | null>;
}
