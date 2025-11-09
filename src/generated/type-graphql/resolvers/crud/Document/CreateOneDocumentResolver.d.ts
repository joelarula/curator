import type { GraphQLResolveInfo } from "graphql";
import { CreateOneDocumentArgs } from "./args/CreateOneDocumentArgs";
import { Document } from "../../../models/Document";
export declare class CreateOneDocumentResolver {
    createOneDocument(ctx: any, info: GraphQLResolveInfo, args: CreateOneDocumentArgs): Promise<Document>;
}
