import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnModelArgs } from "./args/CreateManyAndReturnModelArgs";
import { CreateManyAndReturnModel } from "../../outputs/CreateManyAndReturnModel";
export declare class CreateManyAndReturnModelResolver {
    createManyAndReturnModel(ctx: any, info: GraphQLResolveInfo, args: CreateManyAndReturnModelArgs): Promise<CreateManyAndReturnModel[]>;
}
