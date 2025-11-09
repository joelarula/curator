import type { GraphQLResolveInfo } from "graphql";
import { FindFirstDocumentArgs } from "./args/FindFirstDocumentArgs";
import { Document } from "../../../models/Document";
export declare class FindFirstDocumentResolver {
    findFirstDocument(ctx: any, info: GraphQLResolveInfo, args: FindFirstDocumentArgs): Promise<Document | null>;
}
