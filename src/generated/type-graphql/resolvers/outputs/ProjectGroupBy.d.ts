import { ProjectAvgAggregate } from "../outputs/ProjectAvgAggregate";
import { ProjectCountAggregate } from "../outputs/ProjectCountAggregate";
import { ProjectMaxAggregate } from "../outputs/ProjectMaxAggregate";
import { ProjectMinAggregate } from "../outputs/ProjectMinAggregate";
import { ProjectSumAggregate } from "../outputs/ProjectSumAggregate";
export declare class ProjectGroupBy {
    id: number;
    name: string;
    tenantId: number;
    createdAt: Date;
    updatedAt: Date;
    _count: ProjectCountAggregate | null;
    _avg: ProjectAvgAggregate | null;
    _sum: ProjectSumAggregate | null;
    _min: ProjectMinAggregate | null;
    _max: ProjectMaxAggregate | null;
}
