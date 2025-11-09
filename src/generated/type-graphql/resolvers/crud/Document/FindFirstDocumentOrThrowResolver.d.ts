import type { GraphQLResolveInfo } from "graphql";
import { FindFirstDocumentOrThrowArgs } from "./args/FindFirstDocumentOrThrowArgs";
import { Document } from "../../../models/Document";
export declare class FindFirstDocumentOrThrowResolver {
    findFirstDocumentOrThrow(ctx: any, info: GraphQLResolveInfo, args: FindFirstDocumentOrThrowArgs): Promise<Document | null>;
}
