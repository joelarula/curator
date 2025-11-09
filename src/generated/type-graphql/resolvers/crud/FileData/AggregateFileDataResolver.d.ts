import type { GraphQLResolveInfo } from "graphql";
import { AggregateFileDataArgs } from "./args/AggregateFileDataArgs";
import { AggregateFileData } from "../../outputs/AggregateFileData";
export declare class AggregateFileDataResolver {
    aggregateFileData(ctx: any, info: GraphQLResolveInfo, args: AggregateFileDataArgs): Promise<AggregateFileData>;
}
