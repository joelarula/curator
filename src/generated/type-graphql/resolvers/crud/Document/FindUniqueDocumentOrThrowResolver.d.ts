import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueDocumentOrThrowArgs } from "./args/FindUniqueDocumentOrThrowArgs";
import { Document } from "../../../models/Document";
export declare class FindUniqueDocumentOrThrowResolver {
    getDocument(ctx: any, info: GraphQLResolveInfo, args: FindUniqueDocumentOrThrowArgs): Promise<Document | null>;
}
