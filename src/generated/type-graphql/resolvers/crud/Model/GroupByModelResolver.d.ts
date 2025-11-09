import type { GraphQLResolveInfo } from "graphql";
import { GroupByModelArgs } from "./args/GroupByModelArgs";
import { ModelGroupBy } from "../../outputs/ModelGroupBy";
export declare class GroupByModelResolver {
    groupByModel(ctx: any, info: GraphQLResolveInfo, args: GroupByModelArgs): Promise<ModelGroupBy[]>;
}
