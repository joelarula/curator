import type { GraphQLResolveInfo } from "graphql";
import { FindManyDocumentArgs } from "./args/FindManyDocumentArgs";
import { Document } from "../../../models/Document";
export declare class FindManyDocumentResolver {
    documents(ctx: any, info: GraphQLResolveInfo, args: FindManyDocumentArgs): Promise<Document[]>;
}
