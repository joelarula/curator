import type { GraphQLResolveInfo } from "graphql";
import { AggregateModelArgs } from "./args/AggregateModelArgs";
import { AggregateModel } from "../../outputs/AggregateModel";
export declare class AggregateModelResolver {
    aggregateModel(ctx: any, info: GraphQLResolveInfo, args: AggregateModelArgs): Promise<AggregateModel>;
}
