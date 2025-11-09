import type { GraphQLResolveInfo } from "graphql";
import { CreateManyModelArgs } from "./args/CreateManyModelArgs";
import { AffectedRowsOutput } from "../../outputs/AffectedRowsOutput";
export declare class CreateManyModelResolver {
    createManyModel(ctx: any, info: GraphQLResolveInfo, args: CreateManyModelArgs): Promise<AffectedRowsOutput>;
}
