import type { GraphQLResolveInfo } from "graphql";
import { GroupByDocumentArgs } from "./args/GroupByDocumentArgs";
import { DocumentGroupBy } from "../../outputs/DocumentGroupBy";
export declare class GroupByDocumentResolver {
    groupByDocument(ctx: any, info: GraphQLResolveInfo, args: GroupByDocumentArgs): Promise<DocumentGroupBy[]>;
}
