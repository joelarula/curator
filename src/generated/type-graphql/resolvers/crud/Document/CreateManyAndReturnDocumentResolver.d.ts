import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnDocumentArgs } from "./args/CreateManyAndReturnDocumentArgs";
import { CreateManyAndReturnDocument } from "../../outputs/CreateManyAndReturnDocument";
export declare class CreateManyAndReturnDocumentResolver {
    createManyAndReturnDocument(ctx: any, info: GraphQLResolveInfo, args: CreateManyAndReturnDocumentArgs): Promise<CreateManyAndReturnDocument[]>;
}
