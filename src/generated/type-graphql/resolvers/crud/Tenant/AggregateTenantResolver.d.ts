import type { GraphQLResolveInfo } from "graphql";
import { AggregateTenantArgs } from "./args/AggregateTenantArgs";
import { AggregateTenant } from "../../outputs/AggregateTenant";
export declare class AggregateTenantResolver {
    aggregateTenant(ctx: any, info: GraphQLResolveInfo, args: AggregateTenantArgs): Promise<AggregateTenant>;
}
