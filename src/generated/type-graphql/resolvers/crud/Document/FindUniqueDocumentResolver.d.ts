import type { GraphQLResolveInfo } from "graphql";
import { FindUniqueDocumentArgs } from "./args/FindUniqueDocumentArgs";
import { Document } from "../../../models/Document";
export declare class FindUniqueDocumentResolver {
    document(ctx: any, info: GraphQLResolveInfo, args: FindUniqueDocumentArgs): Promise<Document | null>;
}
