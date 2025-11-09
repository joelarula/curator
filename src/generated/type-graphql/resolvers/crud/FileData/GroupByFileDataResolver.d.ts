import type { GraphQLResolveInfo } from "graphql";
import { GroupByFileDataArgs } from "./args/GroupByFileDataArgs";
import { FileDataGroupBy } from "../../outputs/FileDataGroupBy";
export declare class GroupByFileDataResolver {
    groupByFileData(ctx: any, info: GraphQLResolveInfo, args: GroupByFileDataArgs): Promise<FileDataGroupBy[]>;
}
