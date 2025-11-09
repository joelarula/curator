import type { GraphQLResolveInfo } from "graphql";
import { CreateManyFileDataArgs } from "./args/CreateManyFileDataArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class CreateManyFileDataResolver {
    createManyFileData(ctx: any, info: GraphQLResolveInfo, args: CreateManyFileDataArgs): Promise<AffectedRowsOutput>;
}
