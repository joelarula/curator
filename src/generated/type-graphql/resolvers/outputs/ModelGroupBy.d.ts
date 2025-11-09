import { ModelAvgAggregate } from "../outputs/ModelAvgAggregate";
import { ModelCountAggregate } from "../outputs/ModelCountAggregate";
import { ModelMaxAggregate } from "../outputs/ModelMaxAggregate";
import { ModelMinAggregate } from "../outputs/ModelMinAggregate";
import { ModelSumAggregate } from "../outputs/ModelSumAggregate";
export declare class ModelGroupBy {
    id: number;
    name: string;
    columnName: string;
    source: string | null;
    _count: ModelCountAggregate | null;
    _avg: ModelAvgAggregate | null;
    _sum: ModelSumAggregate | null;
    _min: ModelMinAggregate | null;
    _max: ModelMaxAggregate | null;
}
