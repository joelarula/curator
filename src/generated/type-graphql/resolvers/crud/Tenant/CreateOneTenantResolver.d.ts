import type { GraphQLResolveInfo } from "graphql";
import { CreateOneTenantArgs } from "./args/CreateOneTenantArgs";
import { Tenant } from "../../../models/Tenant";
export declare class CreateOneTenantResolver {
    createOneTenant(ctx: any, info: GraphQLResolveInfo, args: CreateOneTenantArgs): Promise<Tenant>;
}
