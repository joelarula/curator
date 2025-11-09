import type { GraphQLResolveInfo } from "graphql";
import { UpdateManyFileDataArgs } from "./args/UpdateManyFileDataArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class UpdateManyFileDataResolver {
    updateManyFileData(ctx: any, info: GraphQLResolveInfo, args: UpdateManyFileDataArgs): Promise<AffectedRowsOutput>;
}
