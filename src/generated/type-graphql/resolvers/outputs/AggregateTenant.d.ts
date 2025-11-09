import { TenantAvgAggregate } from "../outputs/TenantAvgAggregate";
import { TenantCountAggregate } from "../outputs/TenantCountAggregate";
import { TenantMaxAggregate } from "../outputs/TenantMaxAggregate";
import { TenantMinAggregate } from "../outputs/TenantMinAggregate";
import { TenantSumAggregate } from "../outputs/TenantSumAggregate";
export declare class AggregateTenant {
    _count: TenantCountAggregate | null;
    _avg: TenantAvgAggregate | null;
    _sum: TenantSumAggregate | null;
    _min: TenantMinAggregate | null;
    _max: TenantMaxAggregate | null;
}
