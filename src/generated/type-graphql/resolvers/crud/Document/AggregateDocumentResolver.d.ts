import type { GraphQLResolveInfo } from "graphql";
import { AggregateDocumentArgs } from "./args/AggregateDocumentArgs";
import { AggregateDocument } from "../../outputs/AggregateDocument";
export declare class AggregateDocumentResolver {
    aggregateDocument(ctx: any, info: GraphQLResolveInfo, args: AggregateDocumentArgs): Promise<AggregateDocument>;
}
