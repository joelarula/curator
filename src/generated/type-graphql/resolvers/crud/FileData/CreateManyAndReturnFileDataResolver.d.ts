import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnFileDataArgs } from "./args/CreateManyAndReturnFileDataArgs";
import { CreateManyAndReturnFileData } from "../../outputs/CreateManyAndReturnFileData";
export declare class CreateManyAndReturnFileDataResolver {
    createManyAndReturnFileData(ctx: any, info: GraphQLResolveInfo, args: CreateManyAndReturnFileDataArgs): Promise<CreateManyAndReturnFileData[]>;
}
