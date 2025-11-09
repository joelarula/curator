import type { GraphQLResolveInfo } from "graphql";
import { CreateManyAndReturnTenantArgs } from "./args/CreateManyAndReturnTenantArgs";
import { CreateManyAndReturnTenant } from "../../outputs/CreateManyAndReturnTenant";
export declare class CreateManyAndReturnTenantResolver {
    createManyAndReturnTenant(ctx: any, info: GraphQLResolveInfo, args: CreateManyAndReturnTenantArgs): Promise<CreateManyAndReturnTenant[]>;
}
